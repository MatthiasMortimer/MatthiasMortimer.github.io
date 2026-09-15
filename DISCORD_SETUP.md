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

Use `#support-desk` as the public ticket entry point. Your custom bot should:

1. Show buttons for `New Client Inquiry`, `Project Support`, `Billing`, and `Partnership`.
2. Create a private channel under a separate `TICKETS` category.
3. Permit only the requestor, assigned staff, and the bot.
4. Name tickets with `ticket-1042-project-support-acme`.
5. Send a transcript to `#ticket-log` when a ticket closes.
6. Create or link a relevant `#client-requests` forum post after triage.
7. Remove requester access after the configured ticket retention period.

Grant ticket bots only the permissions they need, such as **Manage Channels**, **Manage Threads**, **Send Messages**, **Read Message History**, and **Attach Files**. Do not grant Administrator.

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

- [ ] Enable **Community** and choose `#rules` as the Rules or Guidelines Channel.
- [ ] Enable **Membership Screening** using the rules above.
- [ ] Set verification level to at least **Medium**.
- [ ] Require 2FA for moderation-capable roles.
- [ ] Create forum channels and add their tags and post templates.
- [ ] Lock private categories down at `@everyone` before inviting clients.
- [ ] Configure your bots with least-privilege permissions.
- [ ] Send ticket, client-forum, and project-forum tests using a non-admin account.
- [ ] Add a server icon, banner, and an invite with an expiration or usage limit for client onboarding.