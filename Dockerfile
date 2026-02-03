FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app files
COPY . .

# Create data directory for SQLite persistence
RUN mkdir -p /data

# Set environment variable for data directory
ENV DATA_DIR=/data

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]