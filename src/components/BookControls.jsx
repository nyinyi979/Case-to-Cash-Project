export default function BookControls() {
  return (
    <>
      <nav className="controls" aria-label="การนำทางสมุด">
        <button id="prev" type="button" aria-label="หน้าก่อนหน้า">‹ ย้อน</button>
        <span className="count" id="count" aria-live="polite">ปก</span>
        <button id="next" type="button" aria-label="หน้าถัดไป">พลิก ›</button>
      </nav>
      <p className="hint">แตะหรือลากหน้ากระดาษเพื่อพลิก ปล่อยก่อนครึ่งทางเพื่อคืนหน้า หรือใช้ปุ่มลูกศร</p>
    </>
  );
}
