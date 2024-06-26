FROM node:22

# Create app directory
WORKDIR /usr/src/app

# Bundle app source
COPY . .

# Install app dependencies
RUN npm install

# Expose port
EXPOSE 8080

# Set environment variables
ENV CLOUD_INSTANCE=https://login.microsoftonline.com/
ENV AZ_TENANT_ID=11111111-1111-1111-1111-111111111111
ENV AZ_CLIENT_ID=00000000-0000-0000-0000-000000000000
ENV AZ_CLIENT_SECRET=xxxxx~xxxxxx~xxxxxxxxxxxxxxxxxxxxxxxxxxx
ENV REDIRECT_URL=https://public-url.example.com
ENV SESSION_SECRET=<A_Secret_Key>

# Run app
CMD ["npm", "start"]
