---
type: changed
issue: 22
---
The gallery's inline pattern views run the pattern's script too, not only the full-page preview: toasts, the unsaved-changes bar, live search, onboarding, master-detail and the filter table respond inside the sample frames (desktop and phone). The script mounts when the frame is drawn on screen, ends when the view is drawn again or the frame goes, and a failure is logged through the SDK logger. The shell layout stays a schematic.
