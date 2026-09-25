const motionOptions = [
  { value: 'full', label: 'เต็ม', title: 'Full: พลิกกระดาษโค้ง พร้อมภาพเคลื่อนไหว' },
  { value: 'medium', label: 'กลาง', title: 'Medium: แอนิเมชันครบทุกอย่าง ปิดเฉพาะเอฟเฟกต์หน้ากระดาษโค้ง' },
  { value: 'none', label: 'ปิด', title: 'Off: เปลี่ยนหน้าทันที ไม่มีภาพเคลื่อนไหว' },
];

export default function BookHeader({ motionMode, onSelectMotion }) {
  return (
    <header className="top">
      <b>สมุดสเก็ตช์ C2C</b>
      <span>Next Gen Collection 2027 ทีม Legal &amp; Enforcement</span>
      <div className="motion-control" role="group" aria-label="ระดับแอนิเมชัน">
        <span className="motion-label">แอนิเมชัน</span>
        <div className="motion-options">
          {motionOptions.map((option) => (
            <button key={option.value} type="button" data-motion-option={option.value}
              aria-pressed={motionMode === option.value} title={option.title}
              onClick={() => onSelectMotion(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
