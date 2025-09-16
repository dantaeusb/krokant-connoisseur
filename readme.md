# What it is

A small weekend project to moderate my telegram channel and group. The bot is extensible and operates within chat context, but generally it is designed to be used in a specific channel so parts of it are hardcoded to work in that context.

## Caution

It is hardcoded to have very little safety checks with Vertex AI, so it can generate inappropriate content (in our case, it WILL). It is also not designed to be used in a public group, as it stores all messages in a database and can be used to extract personal information. Use at your own risk.

## Retention policy

- Messages are stored for 30 days
- Warns and bans are never removed, but don't have PII
- Ignored users are not stored at all
- If you use `/forgetme` command, all your messages and data are deleted

### The big "BUT"

Summarized messages can still contain your information (prompt will be designed to not do that, but "AI" is not something you could trust those things), so if you want to be really sure, don't use the bot at all. If you used it, ask the admin to delete your messages and data.

## How to use

### User commands

- `/ignore` - bot won't record your messages, and won't talk to you
- `/unignore` - bot will start recording your messages again
- `/forgetme` - bot will delete all your messages and data it has about you, also marks you as ignored
- `/warns` - shows your warnings
- `/bans` - shows your bans (bans are 3^n so if your last is not expired you can see how long the next one will take)

### Admin commands

- `/reload` - reload configuration from db
- `/warn` - give a warning, MESSAGE_LIMIT warns lead to a ban
- `/clear` - clear warnings
- `/ban` - ban a user, duration is 3^(n+1) where n is the number of previous bans
- `/unban` - unban a user
- `/permaban` - permanently ban a user
- `/sybau` - stop rephrasing and talk less
- `/yapping` - start rephrasing and talking more

## How to make my own

Most of the things are either hardcoded or configured via mongo db, so it is not a general purpose bot. You can however fork it and modify it to your needs.

To start just add variables to `.env` file and run `docker-compose up -d --build`. The variables you need are listed in `.example.env` file. It requires Google Vertex AI and translation API keys to work, so it's painful to set up.

