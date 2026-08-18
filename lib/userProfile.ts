import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export type AccessLevel = "admin" | "member";
export type UserCategory = "記者" | "技術" | "カメラマン" | "ディレクター";

export const USER_CATEGORIES: UserCategory[] = ["記者", "技術", "カメラマン", "ディレクター"];

export type UserProfile = {
  uid: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  category: UserCategory;
  accessLevel: AccessLevel;
};

const COLLECTION = "users";

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, COLLECTION, uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...(snap.data() as Omit<UserProfile, "uid">) };
}
