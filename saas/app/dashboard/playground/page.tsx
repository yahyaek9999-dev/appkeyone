import { requireUser } from "@/lib/auth";
import Playground from "./playground-ui";

export default async function PlaygroundPage() {
  const user = await requireUser();
  return (
    <div>
      <h1 className="text-3xl font-extrabold mb-2">جرب البوت</h1>
      <p className="text-slate-400 mb-6">
        محاكاة محادثة عميل. اختار رقم تجريبي وكلم البوت كأنك العميل.
      </p>
      <Playground />
    </div>
  );
}
