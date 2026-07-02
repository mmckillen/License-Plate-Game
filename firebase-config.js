// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE CONFIG  —  paste your own keys here to turn on cross-device sync.
//
// The app works WITHOUT this (it saves to the phone it's on). Fill this in to
// share one live board across every device. Full steps are in the README, but
// the short version:
//
//   1. Go to https://console.firebase.google.com  →  "Add project" (free).
//   2. In the project, click the </> ("Web") icon to register a web app.
//   3. Firebase shows you a `firebaseConfig = { ... }` block. Copy those values
//      into the object below.
//   4. In the left menu open  Build → Realtime Database → "Create Database".
//      Pick a location, start in "test mode" for the trip (or use the rules in
//      the README), and copy the databaseURL into the field below if it isn't
//      already filled by step 3.
//   5. Commit + push. Done — every device on the same game code now syncs live.
//
// Leave the values as the placeholder text below to keep the app in local-only
// mode. Once at least apiKey + databaseURL are real, sync switches on.
// ─────────────────────────────────────────────────────────────────────────────

window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
