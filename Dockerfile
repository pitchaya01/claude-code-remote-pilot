FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV CRP_PORT=3742

# Install system deps
RUN apt-get update && apt-get install -y \
    curl \
    tmux \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

COPY package.json ./
COPY bin/ ./bin/
COPY lib/ ./lib/

EXPOSE 3742

CMD ["node", "bin/claude-pilot.js"]
