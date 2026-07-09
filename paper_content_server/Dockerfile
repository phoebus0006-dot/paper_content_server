FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     fonts-noto-cjk \
     fontconfig \
     python3 \
     make \
     g++ \
     build-essential \
  && fc-cache -fv \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8787

CMD ["node", "server.js"]
