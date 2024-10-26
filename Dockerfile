FROM denoland/deno:alpine
COPY . .
EXPOSE 3000
CMD ["deno serve", "index.ts", "--port=3000"]
