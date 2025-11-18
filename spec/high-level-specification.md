TITLE: Rainfall Explorer – UK Environment Agency Rainfall Visualisation

GOAL:
Build an interactive webpage that displays rainfall measurements from the UK Environment Agency API.

FEATURES:
1. Display a map of rainfall measuring stations.
2. Each station must be clickable.
3. On click, show live readings and links to historical data.
4. Allow the user to aggregate historical rainfall data:
   - by region (e.g. South East, North West)
   - by arbitrary time periods (daily, weekly, monthly, custom range)
5. Data should update live using the Environment Agency Flood Monitoring API.
6. UI should be minimal, modern, mobile-friendly.
7. Backend must be optional:
   - MVP can be frontend-only calling the public API.
   - Optionally include a small cache service to reduce API load.
8. Testing:
   - Component tests for UI.
   - API contract tests using mock responses.
9. Non-functional:
   - Map interaction must be smooth.
   - Handle API downtime gracefully.
