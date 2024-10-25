import { Hono } from "npm:hono";
import { basicAuth } from "npm:hono/basic-auth";
import { cache } from "npm:hono/cache";
import { AppBskyFeedPost, AtpAgent, RichText } from "npm:@atproto/api";
import { logger } from "npm:hono/logger";
import { Feed, Item } from "npm:feed";
import { FeedViewPost } from "npm:@atproto/api/dist/client/types/app/bsky/feed/defs";
import { JSDOM } from "npm:jsdom";
import DOMPurify from "npm:dompurify";
import { parse } from "npm:marked";
import { ProfileViewBasic } from "npm:@atproto/api/dist/client/types/app/bsky/actor/defs";

type Variables = {
  agent: AtpAgent;
};

const app = new Hono<{ Variables: Variables }>();

app.use(logger());
app.use(
  "/",
  basicAuth({
    async verifyUser(username, password, c) {
      const agent = new AtpAgent({
        service: "https://bsky.social",
      });
      c.set("agent", agent);

      try {
        await agent.login({
          identifier: username,
          password,
        });
        return true;
      } catch (e) {
        return false;
      }
    },
  }),
);

const validPostToItem = async (
  agent: AtpAgent,
  post: AppBskyFeedPost.Record,
  author: ProfileViewBasic,
  uri: string,
): Promise<Item | null> => {
  const rt = new RichText({
    text: post.text,
    facets: post.facets,
  });

  const link = `https://bsky.app/profile/${author.handle}/${
    uri.split("/")[uri.split("/").length - 1]
  }`;

  let markdown = "";
  for (const segment of rt.segments()) {
    if (segment.isLink()) {
      markdown += `[${segment.text}](${segment.link?.uri})`;
    } else if (segment.isMention()) {
      const author = await agent.getProfile({
        actor: segment.mention!.did,
      });
      markdown +=
        `[${segment.text}](https://bsky.app/profile/${author.data.handle})`;
    } else {
      markdown += segment.text;
    }
  }
  const window = new JSDOM("").window;
  const purify = DOMPurify(window);
  let content = await parse(markdown);
  content = purify.sanitize(content);

  console.log(JSON.stringify(post));

  const title = post.embed?.title || `${post.text.slice(0, 50)}...`;

  return {
    title: title as string,
    content: content,
    link: link,
    date: new Date(post.createdAt),
  };
};

async function postToItem(
  agent: AtpAgent,
  post: FeedViewPost,
): Promise<Item | null> {
  if (AppBskyFeedPost.isRecord(post.post.record)) {
    const res = await AppBskyFeedPost.validateRecord(post.post.record);
    if (res.success) {
      return validPostToItem(
        agent,
        post.post.record,
        post.post.author,
        post.post.uri,
      );
    } else {
      console.error(res.error);
      return null;
    }
  } else {
    console.error("post is not a record");
    return null;
  }
}

app.get(
  "/",
  async (c) => {
    const agent = c.get("agent") as AtpAgent;
    const likes = await agent.getActorLikes({ actor: agent.did! });
    const feed = new Feed({
      title: "BlueSky liked posts",
      description: "RSS feed of all links found in posts you liked.",
      id: "https://bsky.app/",
      link: "https://bsky.app/",
      language: "en-us",
      copyright: "",
    });
    const feedItems = await Promise.all(
      likes.data.feed.map((post) => {
        return postToItem(agent, post);
      }),
    );
    feedItems.forEach((item) => {
      if (item) {
        feed.addItem(item);
      }
    });

    c.res.headers.set("Content-Type", "application/rss+xml");
    c.res.headers.set("Expires", "max-age=3600, must-revalidate");
    return c.text(feed.rss2());
  },
  cache({
    cacheName: "bsky-liked-post-rss",
    cacheControl: "max-age=3600, must-revalidate",
  }),
);

export default app;
