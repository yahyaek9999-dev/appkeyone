import Playground from "./playground-ui";

// Auth is handled by the dashboard layout — no per-page auth call needed.
export default function PlaygroundPage() {
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
