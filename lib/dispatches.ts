import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export type Dispatch = {
  id: string;
  pinId: string;
  date: string; // 出動日(YYYY-MM-DD、本人が入力)
  recordedBy: string;
  notes: string; // 実際どうだったか(現場の状況、変化点など)
  createdAt: Timestamp | null;
};

const DISPATCHES_COLLECTION = "dispatches";

export type NewDispatchInput = {
  pinId: string;
  date: string;
  recordedBy: string;
  notes: string;
};

export async function createDispatch(input: NewDispatchInput): Promise<string> {
  const docRef = await addDoc(collection(db, DISPATCHES_COLLECTION), {
    pinId: input.pinId,
    date: input.date,
    recordedBy: input.recordedBy,
    notes: input.notes,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getDispatchesForPin(pinId: string): Promise<Dispatch[]> {
  const q = query(
    collection(db, DISPATCHES_COLLECTION),
    where("pinId", "==", pinId)
  );
  const snap = await getDocs(q);
  const dispatches = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Dispatch, "id">),
  }));
  // 出動日が新しい順に並べる(クライアント側でソート。複合インデックス不要にするため)
  dispatches.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return dispatches;
}

export async function deleteDispatch(id: string) {
  await deleteDoc(doc(db, DISPATCHES_COLLECTION, id));
}
