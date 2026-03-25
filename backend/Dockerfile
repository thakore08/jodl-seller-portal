# Backend Dockerfile
FROM node:20-bullseye

# Install system dependencies for pdf2pic (Poppler) and Tesseract OCR
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      poppler-utils tesseract-ocr graphicsmagick \
      ghostscript \
      python3 python3-pip python3-venv libglib2.0-0 libsm6 libxrender1 libxext6 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# Install dependencies separately for better caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src ./src
COPY server.js ./

# Ensure uploads directory exists
RUN mkdir -p /app/uploads

EXPOSE 5000

CMD ["node", "server.js"]
