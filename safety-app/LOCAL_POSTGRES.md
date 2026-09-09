# Local PostgreSQL development

The message workflow now uses a local Express API backed by PostgreSQL. The database stores team members and messages; the React app calls the API through the Create React App development proxy.

## 1. Install PostgreSQL

Install PostgreSQL locally using your operating system package manager, then create the development database and user. For a default Ubuntu installation:

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER tactivo WITH PASSWORD 'tactivo';"
sudo -u postgres psql -c "CREATE DATABASE tactivo_safety OWNER tactivo;"
```

Set `DATABASE_URL` to `postgresql://tactivo:tactivo@localhost:5432/tactivo_safety` in a local `.env` file. Do not commit `.env` or production passwords.

## 2. Install dependencies

```bash
npm install
```

## 3. Run the API

```bash
npm run server
```

The API initializes `server/schema.sql`, seeds the four demo members, and listens on `http://localhost:4000`.

## 4. Run the React app

In another terminal:

```bash
npm start
```

The development server proxies `/api` requests to port 4000. In the directory, **Message** opens a compose form; sending stores the message in PostgreSQL and the directory shows recent message history. The selected app role and name are sent as request headers so the API can enforce manager-only member edits.
