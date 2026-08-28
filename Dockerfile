FROM node:22-alpine
WORKDIR /app
COPY . .
ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/demo-service/server.mjs"]
