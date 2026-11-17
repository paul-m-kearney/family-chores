/* OPTIONAL: phone-to-phone sync.
   Leave this as null and the site works on one device with no setup.
   To turn on sync, follow README.md ("Turn on sync"), then paste the web-app config that the
   Firebase console gives you, so it looks like:

   window.FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };

   This config is public by design (it identifies your project, it is not a secret). Access is
   controlled by firestore.rules and your family's long random code. */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyD5LpUPbx803RJazNHDLex-mPiQsf9fwbk",
  authDomain: "family-chores-kearney.firebaseapp.com",
  projectId: "family-chores-kearney",
  storageBucket: "family-chores-kearney.firebasestorage.app",
  messagingSenderId: "247628296822",
  appId: "1:247628296822:web:3e9e39e063be1e8b38e557"
};
