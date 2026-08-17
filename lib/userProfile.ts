import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export type AccessLevel = "admin" | "member";

export type UserProfile = {
  uid: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  category: string; // 記者、カメラマン、ディレクターなど(組織内で自由に設定)
  accessLevel: AccessLevel;
};

const COLLECTION = "users";

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, COLLECTION, uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...(snap.data() as Omit<UserProfile, "uid">) };
}
