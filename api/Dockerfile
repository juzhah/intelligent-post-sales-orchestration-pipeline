FROM node:24.14.0-slim 
WORKDIR /api
COPY package.json /api/
RUN npm install
COPY . /api
CMD ["npm","run", "dev"]