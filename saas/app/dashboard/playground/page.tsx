import Playground from "./playground-ui";

// Auth is handled by the dashboard layout — no per-page auth call needed.
export default function PlaygroundPage() {
  return (
    <div>
      <h1 className="page-title mb-1">تجربة المحادثة</h1>
      <p className="page-desc mb-6">
        محاكاة محادثة عميل. اختر رقماً تجريبياً وجرّب الردود التلقائية كأنك العميل.
      </p>
      <Playground />
    </div>
  );
}
