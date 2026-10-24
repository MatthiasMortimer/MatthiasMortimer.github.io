


# RitesDev Discord Bot

The **Discord Bot Manager** in the RitesDev app launcher is the configuration dashboard and bot runtime. It discovers all servers the bot has joined; there is no server ID to enter. Read the [Discord manager guide](docs/social-bots/discord-bot-setup.md) for token setup, permissions, ticket setup, announcements, and the `/riteserver` command.

## First run

1. Open the Discord Bot Manager and save the bot token under **Bot token**. The token is saved in this repository's ignored `.env` file.
2. Choose **Add bot to a server** in the manager and invite it. Repeat for your other servers.
3. In a server, run `/riteserver`. Its ephemeral controls can apply the saved layout, set the current channel as the default announcement channel, post the ticket panel, or send an announcement to the default channels across servers.
4. Configure the visual server layout, ticket workflow, and announcement destinations in the manager.

The bot registers `/riteserver` globally when it connects. Discord can take time to show global commands in every server. The command requires **Manage Server** permission.

## Optional legacy CLI setup

`npm run discord:setup` remains available for applying `scripts/discord/server-layout.json` to one server. This older CLI requires `DISCORD_GUILD_ID` in the shell environment and is separate from the multi-server dashboard. Use the manager for normal setup and ongoing edits.

Never commit or share a bot token. Keep the launcher running for slash commands, ticket buttons, and dashboard announcements to work.


What it needs to be able to create: DO NOT REMOVE FROM THIS POINT ONWARD, only make small edits to check completed work!.

---

# RitesDev Discord Community Setup

Professional networking, private client collaboration, and project delivery. 

## Server Identity

- **Name:** RitesDev | Client & Project Hub
- **Tagline:** Building better developers and stronger digital products.
- **Description:** A professional community for developer networking, client collaboration, project delivery, and technical growth.

## Roles

Create roles in this order so staff roles remain above member roles.

| Role | Who receives it | Permissions |
| --- | --- | --- |
| Owner | Server owner | Administrator |
| Admin | Trusted operations staff | Manage server, channels, roles, messages, threads, and events |
| Project Manager | Project leads | Manage project channels, messages, threads, and assigned members |
| Moderator | Community moderators | Manage messages, timeout members, view audit log, and handle reports |
| Developer | Assigned contributors | View and participate in assigned project areas |
| Client | Invited clients | View and participate only in assigned client and project areas |
| Network Member | Approved community members | Access networking and public community channels |
| Pending | New or unapproved members | Access onboarding channels only |
| Bot | Custom ticket and automation bots | Grant only the permissions required by each bot |

Do not give `Client` a blanket permission to private client or project categories. Add individual client accounts and the relevant project team to each private category.

## Category and Channel Layout

```text
START HERE
# start-here
# rules
# server-information
# announcements
# apply-or-contact
# introductions

NETWORK
# general
# networking
# opportunities
# project-showcase
# resources
# feedback
# off-topic

SUPPORT & TICKETS
# support-desk
# ticket-log                 (staff and bot only)
# bot-status                 (staff and bot only)
# staff-notes                (staff only)

CLIENT PORTAL                (private)
# client-directory           (staff only)
# client-requests            (forum)
# client-updates             (forum)

PROJECTS                     (private)
# project-directory          (staff only)
# active-projects            (forum)
# internal-projects          (forum; staff and developers only)
# project-archive            (forum; staff only)

TEAM                         (private)
# team-chat
# delivery-review
# operations                 (staff only)
# moderation-log             (staff and moderation bot only)
```

## Permission Matrix

| Area | Pending | Network Member | Client | Developer | Project Manager | Moderator | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| START HERE | View | View | View | View | View | View | Manage |
| NETWORK | No access | View and send | View and send | View and send | Manage messages | Moderate | Manage |
| SUPPORT & TICKETS | Open ticket only | Open ticket only | Open ticket only | Open ticket only | Assigned tickets | Assigned tickets | Manage |
| CLIENT PORTAL | No access | No access | Assigned forums only | Assigned forums only | Assigned forums | No access by default | Manage |
| PROJECTS | No access | No access | Assigned project only | Assigned project only | Assigned projects | No access by default | Manage |
| TEAM | No access | No access | No access | Assigned channels | View and send | Moderate | Manage |

Set `@everyone` to deny **View Channel** for `SUPPORT & TICKETS`, `CLIENT PORTAL`, `PROJECTS`, and `TEAM`. Add explicit category overrides for the people working on each engagement.

## Private Client and Project Categories

Create one category per engagement when client work needs confidentiality.

```text
CLIENT | Acme Co.
# client-brief
# client-files
# client-decisions
# client-support

PROJECT | Acme Website
# project-updates
# implementation
# qa-and-review
# deployment
```

Give access only to the client, assigned `Project Manager`, assigned `Developer`, and required bots. Remove client access after handoff or contract completion.

## Forum Setup

### `#client-requests`

- **Type:** Forum
- **Access:** Admin, Project Manager, and specifically approved clients
- **Required tags:** `New Request`, `In Review`, `Scheduled`, `Waiting on Client`, `Complete`
- **Rule:** One post per request. Keep discussion and files inside its thread.

**Post template:**

```md
## Request Summary
[Brief description]

## Desired Outcome
[What success looks like]

## Deadline / Priority
[Date or priority]

## References
[Relevant links or files]

## Notes
[Additional context]
```

### `#active-projects`

- **Type:** Forum
- **Access:** Assigned project members only
- **Required tags:** `Planning`, `In Progress`, `Blocked`, `Review Needed`, `Client Input`, `Complete`
- **Rule:** Use one post per project or scoped feature. Pin the scope, owner, timeline, and repository links in the opening post.

## Ticket Bot Contract

Use `#support-desk` as the public ticket entry point. The current bot uses private threads under that channel. It should:

1. Show buttons for `New Client Inquiry`, `Project Support`, `Billing`, and `Partnership`.
2. Create a private thread for the requester under `#support-desk`.
3. Permit only the requestor, assigned staff, and the bot.
4. Name tickets with `ticket-1042-project-support-acme`.
5. Send a transcript to `#ticket-log` when a ticket closes.
6. Create or link a relevant `#client-requests` forum post after triage.
7. Remove requester access after the configured ticket retention period.

RitesBot (the Discord Bot Manager) is invited with Administrator so it can build and maintain the whole layout. Grant any other ticket bots only the permissions they need, such as **Manage Channels**, **Manage Threads**, **Send Messages**, **Read Message History**, and **Attach Files**.

## Copy-Ready Channel Messages

### `#start-here`

```md
Welcome to RitesDev.

This server is for professional networking, client collaboration, and project delivery.

1. Read #rules.
2. Introduce yourself in #introductions.
3. Use #apply-or-contact for access or business inquiries.
4. Use #support-desk for private assistance.

Client and project areas are private and available only to assigned members.
```

### `#rules`

```md
1. Communicate respectfully and professionally.
2. Do not share client information, credentials, private files, or project details outside authorized spaces.
3. Use #support-desk for private requests. Do not post sensitive matters publicly.
4. No unsolicited direct messages, spam, or unrelated promotion.
5. Keep messages and files in their appropriate project or client area.
6. Respect moderator and project-manager decisions.
7. Report concerns privately through a ticket.
```

### `#server-information`

```md
RitesDev provides freelance software development, technical consulting, and developer education.

Community areas support professional networking and focused project discussion. For new work, client support, or partnerships, open a request through #support-desk.
```

### `#apply-or-contact`

```md
Need access, want to collaborate, or have a project inquiry?

Open a ticket in #support-desk and choose the option that best fits your request. A RitesDev team member will follow up privately.
```

### `#announcements` Launch Post

```md
@everyone

RitesDev Client & Project Hub is now open.

This is a professional space for developer networking, client collaboration, project delivery, and technical growth.

Start in #start-here, then use #support-desk for any private inquiry or project need.
```

## Discord Community Configuration Checklist

### Bot Features

- [x] Connect one bot to multiple servers and save the token locally. *(Implemented; untested.)*
- [x] Create and update roles, categories, text/announcement/forum channels, forum tags, category access, and per-channel role overrides from the manager. *(Implemented; untested.)*
- [x] Save separate layouts, announcement destinations, and ticket settings per server. *(Implemented; untested.)*
- [x] Post ticket panels, open private ticket threads, close tickets, and deliver HTML transcripts to the ticket log. *(Implemented; untested.)*
- [x] Send announcements to configured servers/channels and register `/riteserver`. *(Implemented; untested.)*

### Bot Implementation Follow-up (note that these are default template options in the manager, and can be freely edited)

- [x] Optimize the Discord manager for Mobile Mode with a stacked narrow-screen layout and touch-friendly controls. *(Implemented; full tests and docs checks pass.)*
- [x] Make Mobile Mode advertise a likely reachable LAN address and show alternate addresses plus connection diagnostics. *(Implemented; LAN reachability not verified on a phone.)*
- [x] Address the Discord manager mobile review: the invite action was already visible at phone widths; collapse optional access/description controls, preserve open sections and focus after rerenders, and keep the editor clear of the mobile tabs while typing. *(Implemented; needs phone-width review.)*
- [x] Finish a polished phone-first Discord manager experience with a compact navigation/header, comfortable editing, and keyboard-aware controls. *(Implemented; `node --test` passes 63/63 and `npm run docs:check` passes 2/2; physical phone/safe-area behavior still needs a device check.)*
- [x] Add per-channel role overrides and make `#support-desk` read-only for `@everyone` under the private support category. *(Implemented; untested.)*
- [x] Apply the role-based defaults that do not require individual assignments: read-only START HERE and announcement channels, public read-only ticket entry, Developer access to `#internal-projects`, and Developer restrictions on `#operations` and `#moderation-log`. The manager bot gets explicit access only to channels it needs. *(Implemented in the starter layout; untested.)*
- [x] Add channel/category access for named members and remove their overrides to revoke access after handoff. *(Implemented; untested.)*
- [ ] Apply named-member grants for actual client/project assignments and verify the full matrix, ticket entry, and private logs with non-admin accounts.
- [x] Define the manager's top-to-bottom role order; add layout role assignment and the Pending-to-Network Member approval flow. New members receive Pending after an applied layout. *(Implemented; untested.)*
- [x] Add copy-ready message templates and a safe way to post the `#start-here`, `#rules`, `#server-information`, `#apply-or-contact`, and launch messages into their channels without duplicating them. *(Implemented; untested.)*
- [x] Implement the ticket contract using private threads: editable ticket types; requester/staff/bot access; `ticket-1042-project-support-acme` naming; transcript delivery to `#ticket-log`; a linked client-request forum post after triage; and requester removal after configurable retention. *(Implemented; untested.)*
- [x] Retain the private-thread ticket design instead of switching to private channels under `TICKETS`.
- [x] Add an explicit, permission-checked option for `@everyone` and other role mentions in announcements; mentions remain suppressed by default. *(Implemented; untested.)*
