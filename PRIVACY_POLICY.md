# Privacy Policy for Discord Friends Graph

Last updated: May 12, 2026

This Privacy Policy describes how the Discord Friends Graph Chrome extension ("Discord Friends Graph", "the extension", "we", "us", or "our") collects, uses, stores, and shares information when you use the extension.

## Summary

Discord Friends Graph is a local-first Chrome extension that helps you visualize your Discord friend network. The extension does not operate a backend service and does not send collected data to the developer's servers.

## Information the Extension Accesses or Collects

When you choose to scan your Discord friend network, the extension may access the following information from your active Discord web session:

- Discord authentication/session data needed to make Discord requests on your behalf from your local browser session
- Your Discord friend list
- Mutual friend relationship data between your account and your Discord friends
- Mutual server information returned by Discord, including server names and server-specific nicknames when available
- Discord user profile fields needed to display the graph, such as user IDs, usernames, display names, discriminators, avatar references, and profile links

The extension also stores the following information locally in your browser after a scan or import:

- Scanned connection graph data
- Scan progress state
- Graph preferences such as the "hide names" setting
- Data that you choose to import from a JSON file

## How the Information Is Used

The extension uses this information only to provide its core functionality:

- build and display a graph of your Discord friend network
- show mutual connections and mutual servers
- allow you to save, clear, export, and import graph data locally
- preserve scan progress and local display preferences

## Storage and Retention

- Scanned graph data is stored locally in `chrome.storage.local` in your browser profile until you delete it, overwrite it, or uninstall the extension.
- Imported graph data is stored locally in `chrome.storage.local` until you delete it, overwrite it, or uninstall the extension.
- Exported JSON files are stored wherever you choose to save them through Chrome's download flow.
- Discord authentication/session data accessed during scanning is used transiently to complete requests and is not intentionally written by the extension to persistent storage.

## Data Sharing

We do not sell your data.

We do not transfer scanned graph data to the developer's servers.

We do not use third-party analytics, advertising, tracking pixels, or remote logging services.

Data may be shared only in the following limited cases:

- with Discord, when the extension sends requests from your browser to Discord endpoints needed to build the graph
- with your local device storage, when Chrome stores extension data in `chrome.storage.local`
- with any person or service you choose to share an exported JSON file with
- if required to comply with applicable law, regulation, legal process, or enforceable governmental request

## Remote Resources

The extension may display Discord-hosted avatar images and other Discord profile-related resources directly from Discord-controlled URLs in the extension UI. This is done to render the graph and related profile views.

## When You Publish a Shareable Page

The extension lets you generate a single self-contained `.html` file
("share page") that renders your scanned graph. The extension itself still
does not transmit your data to any server we operate.

You should understand the following before you publish a share page:

- When you click **Export Shareable Page**, the extension produces a file
  on your computer that contains the data you selected, with the
  obfuscation choices you made.
- If you choose to upload that file to a public host, **anyone who finds
  the URL can read the file's contents**, including the Discord user IDs
  of the friends included in the share.
- The **Hide names** option removes display names, usernames, and tags
  from the file. The **Hide avatars** option replaces Discord avatar URLs
  with a placeholder. These choices are baked into the file before
  download.
- **Discord user IDs always remain readable** inside the published file,
  even when names and avatars are hidden. That is what makes cross-user
  merging possible.
- A visitor with the extension installed can produce a merged version of
  your published file combined with their own scan, and publish that
  merged file without notifying you. The merged file will contain the
  user IDs from your original share plus the visitor's scanned data.
- You can revoke a published share only by deleting the file from the
  host you uploaded it to. There is no remote revocation built into the
  extension.

## When You Merge with a Shared Page

The extension's merge flow only reads data locally:

- Reading from the active tab requires you to click **Read active tab**.
  Chrome's `activeTab` permission grants access to the user-selected tab
  only at that moment, with no broader host permissions.
- Dropping a file into the merge dropzone reads the file from your local
  filesystem through Chrome's standard file input. No permission is
  needed.
- The match preview, the merged graph preview, and the merged share file
  are all built locally in your browser.

The merged share file you publish carries the same privacy posture as any
share page you publish directly.

## Your Choices and Controls

You can:

- choose whether to start a scan
- choose how many friends to scan
- stop a scan in progress
- clear stored extension data at any time
- export your locally stored graph data
- import previously exported graph data
- export a shareable HTML page with the obfuscation choices that suit you
- merge a share page with your own data and choose whether to publish the
  result
- uninstall the extension to remove extension-managed local storage from Chrome

## Security

The extension is designed to operate locally in your browser and does not intentionally transmit scanned graph data to the developer's own servers. However, no software or local storage mechanism can be guaranteed to be perfectly secure. You are responsible for protecting your device, browser profile, and any exported files.

## Children's Privacy

The extension is not directed to children under 13, and we do not knowingly collect personal information from children through a developer-operated service.

## Changes to This Privacy Policy

We may update this Privacy Policy from time to time. When we do, we will update the "Last updated" date above. Your continued use of the extension after a change means the updated policy applies going forward.

## Contact

For questions about this Privacy Policy, contact:

- Name: Harrison Qian
- Email: harrisonq125@gmail.com
- Website or support page: https://github.com/harqian/discord-friends-graph/issues
