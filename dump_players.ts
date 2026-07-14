import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBEi_PQ2oYKW23Fu65M7MKPFKELRbqY6XQ",
  authDomain: "bobblekolik.firebaseapp.com",
  projectId: "bobblekolik",
  storageBucket: "bobblekolik.firebasestorage.app",
  messagingSenderId: "566665011913",
  appId: "1:566665011913:web:4e2570f7291f82fdb76318"
};

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const snap = await getDocs(query(collection(db, 'players'), limit(20)));
  snap.docs.forEach(d => {
    console.log(`ID: "${d.id}" -> Name: "${d.data().pname}", Team: "${d.data().pteam}", TeamOriginal: "${d.data().pteam_original || ''}"`);
  });
}

main().catch(console.error);
