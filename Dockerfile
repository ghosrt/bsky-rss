FROM denoland/deno:alpine

# The port that your application listens to.
EXPOSE 3000

WORKDIR /

# Prefer not to run as root.
USER deno

# Cache the dependencies as a layer (the following two steps are re-run only when deps.ts is modified).
# Ideally cache deps.ts will download and compile _all_ external files used in main.ts.
RUN deno install --entrypoint index.ts

# These steps will be re-run upon each file change in your working directory:
COPY . .
# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno cache index.ts

CMD ["run", "--allow-net", "index.ts"]
