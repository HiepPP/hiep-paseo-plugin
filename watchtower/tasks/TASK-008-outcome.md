# TASK-008 Outcome

## Outcome

Status: BLOCKED

Changed:
- Restricted the Watchtower panel to the Explorer location.
- The open command now explicitly targets Explorer beside Files and Changes.
- The board header now shows the project name instead of the conversation title.
- Updated the plugin README.

Contract:
- The query key includes the host and exact workspace ID.
- The backend reads only the requested workspace directory.
- Task selection remains scoped to its workspace. Attachments and read-only behavior are unchanged.

Verified:
- The installed Paseo 0.8 SDK supports Explorer locations and explicit open targets.
- Formatter, typecheck, lint, and all 10 tests passed.
- Plugin reload reported running. No commit or push was made.
- Source inspection confirmed the existing workspace data boundary.
- The user manually confirmed Explorer placement and correct data when switching projects.

Blocked:
- Native UI verification failed before connecting to the app: Sky Computer Use native pipe startup failed.
- Reconnecting and resetting the UI tool session did not resolve the startup failure.
- Only closing the obsolete center tab remains unverified.

Handoff:
- Open Command Center and choose Open Watchtower board in the intended workspace.
- Explorer placement and project switching are confirmed by the user.
- Close any old Watchtower center tab. Mark DONE only after the UI checks pass.
