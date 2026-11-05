'use client';

import { useEffect, useRef, useState } from 'react';
import s from './landing.module.css';

function Shield({ small = false }: { small?: boolean }) {
  return (
    <svg width={small ? 20 : 26} height={small ? 22 : 28} viewBox="0 0 24 26" fill="none" aria-hidden="true">
      <path d="M12 2 21 6v7c0 5-5 9-9 11-4-2-9-6-9-11V6l9-4Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m8 13 3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const steps = [
  {
    name: 'Tiếp nhận giao dịch',
    stage: 'Tiếp nhận',
    title: '01 · Tiếp nhận thông tin giao dịch',
    description: 'Hệ thống tự động ghi nhận thông tin đơn hàng, số tiền, kênh thanh toán và thời gian giao dịch của doanh nghiệp để chuẩn bị kiểm tra.',
    cardIndex: 0,
  },
  {
    name: 'Dấu hiệu nghi vấn',
    stage: 'Đã phân công',
    title: '02 · Tổng hợp dấu hiệu & giao việc',
    description: 'Khi phát hiện điểm nghi vấn, hệ thống tự động gom các dấu hiệu cảnh báo vào hồ sơ và giao cho nhân viên phụ trách kiểm tra.',
    cardIndex: 1,
  },
  {
    name: 'Báo cáo xác minh',
    stage: 'Chờ duyệt',
    title: '03 · Kiểm tra thực tế & gửi đề xuất',
    description: 'Nhân viên đối chiếu thông tin khách hàng, ghi lại kết quả kiểm tra thực tế và gửi đề xuất xử lý lên cấp quản lý.',
    cardIndex: 2,
  },
  {
    name: 'Phê duyệt & Lưu trữ',
    stage: 'Hoàn tất',
    title: '04 · Quản lý phê duyệt & lưu vào hệ thống',
    description: 'Cấp quản lý xem xét đề xuất, đưa ra quyết định xử lý cuối cùng và hệ thống tự động lưu trữ kết quả để tra cứu về sau.',
    cardIndex: 3,
  },
];

const detectionModes = {
  AI: {
    badge: 'AI NEURAL',
    label: 'Trí tuệ nhân tạo (AI)',
    title: 'Phát hiện bằng AI + Giải thích căn cứ',
    description: 'AI tự động phân tích hành vi phức tạp để nhận diện giao dịch Bất thường hay Bình thường, kèm mức độ tin cậy và giải thích rõ vì sao nghi vấn.',
    signals: [
      ['Kết quả kiểm tra', 'Bất thường (Cần lưu ý)'],
      ['Độ tin cậy của AI', '91% (Rất đáng ngờ)'],
      ['Căn cứ kèm theo', 'Giải thích chi tiết các điểm bất thường'],
    ],
  },
  RULE: {
    badge: 'RULE ENGINE',
    label: 'Bộ quy tắc tự động',
    title: 'Kiểm tra theo các điều kiện đặt trước',
    description: 'Tự động so sánh thông tin giao dịch với các điều kiện kinh doanh do doanh nghiệp đặt ra (ví dụ: đơn hàng vượt hạn mức, đặt nhiều lần liên tiếp).',
    signals: [
      ['Kết quả kiểm tra', 'Bất thường / Bình thường / Chưa rõ'],
      ['Cách thức kiểm tra', 'So khớp điều kiện đặt sẵn'],
      ['Căn cứ kèm theo', 'Danh sách điều kiện đã vi phạm'],
    ],
  },
  RULE_FALLBACK: {
    badge: 'DỰ PHÒNG',
    label: 'Khi AI gặp sự cố',
    title: 'Tự động chuyển sang quy tắc dự phòng',
    description: 'Nếu dịch vụ AI tạm thời gián đoạn, hệ thống tự động dùng bộ quy tắc của doanh nghiệp để kiểm tra, đảm bảo công việc kinh doanh không bao giờ bị ngừng trệ.',
    signals: [
      ['Phương thức áp dụng', 'Quy tắc dự phòng (Ghi rõ nguồn)'],
      ['Tính ổn định', 'Giao dịch được kiểm tra liên tục'],
      ['Căn cứ kèm theo', 'Quy tắc dự phòng đã kích hoạt'],
    ],
  },
};

const howSteps = [
  {
    number: '1',
    title: 'Khởi tạo không gian làm việc',
    description: 'Thiết lập khu vực riêng cho doanh nghiệp, kết nối nhận dữ liệu tự động hoặc tải tệp giao dịch lên hệ thống trong môi trường hoàn toàn bảo mật.',
  },
  {
    number: '2',
    title: 'Hệ thống tự động kiểm tra',
    description: 'Hệ thống đối chiếu giao dịch qua AI và bộ quy tắc thông minh, phân loại kết quả và gửi thông báo nếu phát hiện dấu hiệu bất thường.',
  },
  {
    number: '3',
    title: 'Xác minh & duyệt quyết định',
    description: 'Nhân viên kiểm tra bằng chứng thực tế, ghi lại ý kiến và cấp quản lý phê duyệt hướng xử lý cuối cùng, lưu lịch sử minh bạch.',
  },
];

const questions = [
  [
    'FraudGuard phân loại giao dịch như thế nào?',
    'Hệ thống tự động xếp giao dịch vào 3 nhóm: Bất thường, Bình thường hoặc Chưa rõ. Với gói AI, hệ thống chỉ rõ mức độ tin cậy và lý do nghi vấn; với gói quy tắc, hệ thống cho biết chính xác giao dịch đã vi phạm điều kiện nào do bạn thiết lập.',
  ],
  [
    'Ai là người thiết lập quy tắc và ai ra quyết định xử lý?',
    'Đội ngũ kỹ thuật sẽ hỗ trợ doanh nghiệp cài đặt và kiểm tra thử các quy tắc ban đầu. Trong công việc hằng ngày, nhân viên phụ trách sẽ kiểm tra thông tin thực tế và gửi báo cáo để cấp quản lý đưa ra quyết định xử lý cuối cùng.',
  ],
  [
    'Nếu dịch vụ AI tạm thời gián đoạn thì giao dịch được xử lý ra sao?',
    'Hệ thống sẽ tự động chuyển sang kiểm tra bằng bộ quy tắc thông thường của doanh nghiệp, giúp việc kiểm soát đơn hàng luôn liên tục mà không bao giờ bị ngắt quãng.',
  ],
  [
    'Doanh nghiệp cần chuẩn bị những gì khi bắt đầu sử dụng?',
    'Doanh nghiệp chỉ cần cho biết những thông tin giao dịch cần theo dõi và các rủi ro hay gặp. Đội ngũ kỹ thuật sẽ hỗ trợ thiết lập, chạy thử nghiệm trên dữ liệu mẫu và bàn giao tài khoản sử dụng ngay.',
  ],
];

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<'AI' | 'RULE' | 'RULE_FALLBACK'>('AI');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const currentStep = steps[step];
  const currentDetection = detectionModes[source];

  return (
    <div ref={rootRef} className={s.pageRoot}>
      <a className={s.skip} href="#main">Đến nội dung chính</a>

      {/* Floating Island Header */}
      <header className={`${s.header} ${scrolled ? s.headerScrolled : ''}`}>
        <div className={s.headerInner}>
          <a className={s.brand} href="#" aria-label="FraudGuard, về đầu trang">
            <Shield />
            <span>Fraud<span className={s.brandLight}>Guard</span></span>
          </a>

          <button
            ref={menuButton}
            className={s.menuButton}
            aria-expanded={menuOpen}
            aria-controls="navigation"
            onClick={() => setMenuOpen(!menuOpen)}
            onKeyDown={e => { if (e.key === 'Escape') setMenuOpen(false); }}
          >
            {menuOpen ? 'Đóng' : 'Menu'} <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
          </button>

          <nav
            id="navigation"
            className={`${s.nav} ${menuOpen ? s.navOpen : ''}`}
            aria-label="Điều hướng chính"
            onKeyDown={e => { if (e.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); } }}
          >
            {[
              ['Tính năng', '#tinh-nang'],
              ['Hồ sơ điều tra', '#ho-so'],
              ['Cơ chế phát hiện', '#co-che'],
              ['Cách hoạt động', '#vai-tro'],
              ['Gói sử dụng', '#goi-su-dung'],
            ].map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
            ))}
            <a className={s.navCta} href="#lien-he" onClick={() => setMenuOpen(false)}>
              Liên hệ tư vấn <Arrow />
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Cinematic Apple Hero Section */}
        <div className={s.heroWrap}>
          <section className={`${s.container} ${s.hero}`} id="san-pham" aria-labelledby="hero-heading">
            <div className={s.heroCopy}>
              <p className={s.kickerPill}>
                <span className={s.liveDot} aria-hidden="true" />
                <Shield small /> FraudGuard 2.0 · Nền tảng kiểm soát rủi ro giao dịch
              </p>

              <h1 id="hero-heading">
                Quy trình rõ ràng.<br />
                <span>Kiểm soát rủi ro liền mạch.</span>
              </h1>

              <p className={s.heroDescription}>
                Kết nối theo dõi giao dịch đa kênh, nhận diện sớm dấu hiệu bất thường và xử lý hồ sơ tập trung trong một quy trình thống nhất. Mọi bước đều có bằng chứng rõ ràng, người chịu trách nhiệm và lịch sử ghi nhận đầy đủ.
              </p>

              <div className={s.actions}>
                <a className={s.primary} href="#lien-he">
                  Liên hệ với chúng tôi <Arrow />
                </a>
                <a className={s.secondary} href="#ho-so">
                  Xem luồng hồ sơ điều tra
                </a>
              </div>

              {/* Apple Window Mockup Showcase */}
              <div className={s.heroWindow}>
                <div className={s.windowHeader}>
                  <div className={s.windowDots}>
                    <span className={`${s.windowDot} ${s.dotRed}`} />
                    <span className={`${s.windowDot} ${s.dotYellow}`} />
                    <span className={`${s.windowDot} ${s.dotGreen}`} />
                  </div>
                  <span className={s.windowTitle}>
                    <Shield small /> FraudGuard Security Engine · Realtime Dashboard
                  </span>
                  <span className={s.windowStatus}>
                    <span className={s.liveDot} /> Giám sát trực tiếp
                  </span>
                </div>

                <div className={s.windowContent}>
                  <div className={s.telemetryGrid}>
                    <div className={s.telemetryCard}>
                      <div className={s.telemetryLabel}>ĐỘ CHÍNH XÁC PHÂN LOẠI</div>
                      <div className={s.telemetryValue}>99.4%</div>
                      <div className={s.telemetrySub}>Xác minh chuẩn xác qua 2 lớp</div>
                    </div>
                    <div className={s.telemetryCard}>
                      <div className={s.telemetryLabel}>TỐC ĐỘ PHẢN HỒI AI</div>
                      <div className={s.telemetryValue}>&lt; 45ms</div>
                      <div className={s.telemetrySub}>Phân tích và cảnh báo tức thì</div>
                    </div>
                    <div className={s.telemetryCard}>
                      <div className={s.telemetryLabel}>TÍNH LIÊN TỤC VẬN HÀNH</div>
                      <div className={s.telemetryValue}>100%</div>
                      <div className={s.telemetrySub}>Tự động kích hoạt quy tắc dự phòng</div>
                    </div>
                  </div>

                  <div className={s.windowLiveBar}>
                    <div className={s.windowLiveInfo}>
                      <span className={s.windowPillDanger}>Cảnh báo rủi ro</span>
                      <span>Giao dịch <strong>#TX-98214</strong> · 15.800.000 đ · Vượt hạn mức bất thường</span>
                    </div>
                    <div className={s.windowLiveAction}>
                      Đã đưa vào hồ sơ điều tra →
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Section 01: Apple Bento Grid */}
        <section className={`${s.section} ${s.sectionSurface}`} id="tinh-nang" aria-labelledby="features-heading">
          <div className={s.container}>
            <div className={s.centerHeader}>
              <p className={s.sectionNumber}>01 / QUY TRÌNH KIỂM SOÁT RỦI RO</p>
              <h2 id="features-heading">
                Đánh giá chuẩn xác,<br />
                <span>vận hành xuyên suốt</span>
              </h2>
              <p className={s.centerSub}>
                Từ cổng thanh toán, ví điện tử đến đơn hàng giao tận nơi (COD), mỗi doanh nghiệp đều có quy tắc riêng nhưng chung một quy trình kiểm soát, rà soát và đối chiếu minh bạch.
              </p>
            </div>

            <div className={s.bentoGrid}>
              {/* Card 1 (Span 8) */}
              <article className={`${s.bentoCard} ${s.bentoCol8}`}>
                <div>
                  <span className={s.bentoBadge}>TIÊU CHUẨN ĐÁNH GIÁ</span>
                  <h3>Phân loại kết quả giao dịch rõ ràng</h3>
                  <p>
                    Tự động phân loại từng giao dịch thành Bình thường, Bất thường hoặc Cần kiểm tra thêm, kèm theo lý do và dấu hiệu cụ thể để nhân viên dễ dàng đối chiếu.
                  </p>
                </div>
                <div className={s.bentoVisualPills}>
                  <span className={`${s.visualChip} ${s.chipGreen}`}><Check /> Bình thường · Tự động duyệt</span>
                  <span className={`${s.visualChip} ${s.chipOrange}`}>● Cần kiểm tra · Chuyển hàng đợi</span>
                  <span className={`${s.visualChip} ${s.chipRed}`}>▲ Bất thường · Cảnh báo rủi ro</span>
                </div>
              </article>

              {/* Card 2 (Span 4) */}
              <article className={`${s.bentoCard} ${s.bentoCol4}`}>
                <div>
                  <span className={s.bentoBadge}>BẢO MẬT DỮ LIỆU</span>
                  <h3>Hồ sơ doanh nghiệp riêng biệt</h3>
                  <p>
                    Dữ liệu và quy trình được gắn theo từng hồ sơ doanh nghiệp cụ thể, bảo mật thông tin nội bộ, tự quản lý nhân sự và thiết lập phạm vi kiểm soát riêng biệt.
                  </p>
                </div>
                <div className={s.bentoVisualToggle}>
                  <span>Bảo mật dữ liệu hồ sơ</span>
                  <span style={{ color: 'var(--green)' }}>Đã kích hoạt</span>
                </div>
              </article>

              {/* Card 3 (Span 4) */}
              <article className={`${s.bentoCard} ${s.bentoCol4}`}>
                <div>
                  <span className={s.bentoBadge}>KIỂM THỬ AN TOÀN</span>
                  <h3>Chạy thử an toàn trước khi áp dụng</h3>
                  <p>
                    Cho phép thiết lập và kiểm tra thử nghiệm các quy tắc kiểm soát trên dữ liệu mẫu trước khi đưa vào hoạt động chính thức, tránh chặn nhầm khách hàng.
                  </p>
                </div>
                <div className={s.bentoVisualToggle}>
                  <span>Chế độ kiểm thử (Sandbox)</span>
                  <div className={s.toggleSwitch}><div className={s.toggleThumb} /></div>
                </div>
              </article>

              {/* Card 4 (Span 8) */}
              <article className={`${s.bentoCard} ${s.bentoCol8}`}>
                <div>
                  <span className={s.bentoBadge}>PHÂN ĐỊNH TRÁCH NHIỆM</span>
                  <h3>Quy trình xác minh và phê duyệt hai bước</h3>
                  <p>
                    Phân định rõ trách nhiệm giữa nhân viên kiểm tra bằng chứng thực tế và cấp quản lý phê duyệt quyết định cuối cùng trên từng trường hợp nghi vấn.
                  </p>
                </div>
                <div className={s.bentoVisualTimeline}>
                  <span className={s.timelineNode}>1. Nhân viên kiểm tra bằng chứng</span>
                  <span className={s.timelineArrow}>→</span>
                  <span className={s.timelineNode}>2. Báo cáo đề xuất</span>
                  <span className={s.timelineArrow}>→</span>
                  <span className={s.timelineNode} style={{ background: 'var(--blue-subtle)', color: 'var(--blue)' }}>3. Quản lý duyệt quyết định</span>
                </div>
              </article>

              {/* Card 5 (Span 4) */}
              <article className={`${s.bentoCard} ${s.bentoCol4}`}>
                <div>
                  <span className={s.bentoBadge}>LỊCH SỬ MINH BẠCH</span>
                  <h3>Ghi nhận lịch sử xử lý đầy đủ</h3>
                  <p>
                    Lưu lại toàn bộ lịch sử thao tác, từ thay đổi cài đặt đến người đưa ra quyết định xử lý, giúp việc kiểm tra và đối chiếu nội bộ luôn rõ ràng.
                  </p>
                </div>
                <div className={s.bentoVisualToggle} style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                  <span>Log #8812: Đã duyệt bởi Quản lý</span>
                  <span>14:20:05</span>
                </div>
              </article>

              {/* Card 6 (Span 8) */}
              <article className={`${s.bentoCard} ${s.bentoCol8}`}>
                <div>
                  <span className={s.bentoBadge}>ĐỘNG CƠ KÉP THÔNG MINH</span>
                  <h3>Kết hợp AI và bộ quy tắc linh hoạt</h3>
                  <p>
                    Áp dụng công nghệ trí tuệ nhân tạo (AI) cùng các quy tắc do doanh nghiệp đặt ra, tự động chuyển đổi phương án dự phòng để quy trình đánh giá không bao giờ bị gián đoạn.
                  </p>
                </div>
                <div className={s.bentoVisualPills}>
                  <span className={`${s.visualChip} ${s.chipGreen}`}>AI Neural Engine: Hoạt động</span>
                  <span className={`${s.visualChip} ${s.chipOrange}`}>Rule Engine Dự phòng: Sẵn sàng</span>
                  <span className={`${s.visualChip} ${s.chipGreen}`}>Độ trễ chuyển đổi: 0ms</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Section 02: Apple Segmented Control & Central Case Hub */}
        <section className={s.section} id="ho-so" aria-labelledby="story-heading">
          <div className={s.container}>
            <div className={s.centerHeader}>
              <p className={s.sectionNumber}>02 / QUẢN LÝ HỒ SƠ TẬP TRUNG</p>
              <h2 id="story-heading">
                Một hồ sơ xử lý,<br />
                <span>toàn bộ thông tin trên một màn hình</span>
              </h2>
              <p className={s.centerSub}>
                Từ lúc phát hiện giao dịch bất thường đến khi kết luận, nhân viên kiểm tra và cấp quản lý đều xem chung một hồ sơ thống nhất, không sợ thất lạc thông tin.
              </p>
            </div>

            {/* Apple Segmented Control */}
            <div className={s.segmentedWrap}>
              <div className={s.segmentedControl} role="group" aria-label="Các bước trong tình huống">
                {steps.map((item, i) => (
                  <button
                    key={item.name}
                    type="button"
                    aria-pressed={step === i}
                    onClick={() => setStep(i)}
                    className={`${s.segmentedTab} ${step === i ? s.segmentedTabActive : ''}`}
                  >
                    <span>0{i + 1}</span> {item.name}
                  </button>
                ))}
              </div>
            </div>

            <div className={s.hubGrid} aria-live="polite">
              <div className={s.hubCol}>
                <article
                  onClick={() => setStep(0)}
                  className={`${s.caseSheet} ${currentStep.cardIndex === 0 ? s.caseSheetActive : ''}`}
                >
                  <div className={s.sheetHeader}>
                    <span className={s.sheetNum}>01</span>
                    <span>Thông tin giao dịch ban đầu</span>
                  </div>
                  <h3>Thông tin ban đầu từ doanh nghiệp</h3>
                  <p>Tập hợp thông tin giao dịch, kênh thanh toán và các yếu tố liên quan để nhân viên có cái nhìn tổng quát ngay từ đầu.</p>
                </article>

                <article
                  onClick={() => setStep(1)}
                  className={`${s.caseSheet} ${currentStep.cardIndex === 1 ? s.caseSheetActive : ''}`}
                >
                  <div className={s.sheetHeader}>
                    <span className={s.sheetNum}>02</span>
                    <span>Dấu hiệu cảnh báo</span>
                  </div>
                  <h3>Lý do giao dịch cần kiểm tra</h3>
                  <p>Hiển thị rõ các dấu hiệu bất thường hoặc điều kiện cảnh báo để nhân viên biết chính xác vì sao giao dịch cần được xem xét.</p>
                </article>
              </div>

              <div className={s.hubCenter}>
                <div>
                  <div className={s.hubTop}>
                    <span className={s.hubCode}>Hồ sơ xử lý tập trung · Quy trình 4 bước</span>
                    <span className={s.sourceLabel}>{currentStep.stage}</span>
                  </div>
                  <h3>Liên kết xuyên suốt từ lúc phát hiện nghi vấn đến quyết định xử lý cuối cùng</h3>

                  <div className={s.hubMetaGrid}>
                    <div className={s.hubMetaItem}>
                      <span>NGƯỜI XÁC MINH</span>
                      <strong>Nhân viên kiểm tra</strong>
                    </div>
                    <div className={s.hubMetaItem}>
                      <span>NGƯỜI PHÊ DUYỆT</span>
                      <strong>Quản lý vận hành</strong>
                    </div>
                  </div>

                  <div className={s.stepperTrack} aria-label="Tiến trình hồ sơ">
                    {['Tiếp nhận', 'Giao việc', 'Báo cáo', 'Kết luận'].map((label, idx) => (
                      <div
                        key={label}
                        onClick={() => setStep(idx)}
                        className={`${s.stepperNode} ${idx < step ? s.stepperNodeDone : idx === step ? s.stepperNodeActive : ''}`}
                      >
                        <span>Bước {idx + 1}</span>
                        <strong>{label}</strong>
                      </div>
                    ))}
                  </div>

                  <div className={s.hubFocusBox} key={step}>
                    <strong>{currentStep.title}</strong>
                    <p>{currentStep.description}</p>
                  </div>
                </div>

                <div className={s.stepPagination}>
                  <span>0{step + 1} <span>/ 04 · Quy trình xử lý hồ sơ</span></span>
                  <button
                    type="button"
                    className={s.circleBtn}
                    onClick={() => setStep((step + 1) % steps.length)}
                    aria-label={step === 3 ? 'Xem lại từ giao dịch' : 'Xem bước tiếp theo'}
                  >
                    <Arrow />
                  </button>
                </div>
              </div>

              <div className={s.hubCol}>
                <article
                  onClick={() => setStep(2)}
                  className={`${s.caseSheet} ${currentStep.cardIndex === 2 ? s.caseSheetActive : ''}`}
                >
                  <div className={s.sheetHeader}>
                    <span className={s.sheetNum}>03</span>
                    <span>Báo cáo xác minh</span>
                  </div>
                  <h3>Đề xuất phương án có căn cứ</h3>
                  <p>Nhân viên ghi lại kết quả kiểm tra thực tế, đính kèm nhận định và gửi đề xuất phương án xử lý lên người quản lý.</p>
                </article>

                <article
                  onClick={() => setStep(3)}
                  className={`${s.caseSheet} ${currentStep.cardIndex === 3 ? s.caseSheetActive : ''}`}
                >
                  <div className={s.sheetHeader}>
                    <span className={s.sheetNum}>04</span>
                    <span>Quyết định &amp; Lưu lịch sử</span>
                  </div>
                  <h3>Chốt phương án và lưu trữ hệ thống</h3>
                  <p>Người quản lý duyệt quyết định xử lý cuối cùng; mọi thao tác và thời gian đều được lưu tự động để tra cứu đối soát khi cần.</p>
                </article>
              </div>
            </div>
          </div>
        </section>

        {/* Section 03: Detection Window */}
        <section className={`${s.section} ${s.sectionSurface}`} id="co-che" aria-labelledby="detection-heading">
          <div className={s.container}>
            <div className={s.centerHeader}>
              <p className={s.sectionNumber}>03 / CÁCH HỆ THỐNG PHÁT HIỆN GIAN LẬN</p>
              <h2 id="detection-heading">
                Kết quả kiểm tra rõ ràng.<br />
                <span>Có căn cứ. Có giải thích.</span>
              </h2>
              <p className={s.centerSub}>
                Biết chính xác giao dịch được phát hiện nhờ trí tuệ nhân tạo (AI), bộ quy tắc kiểm tra tự động hay phương án dự phòng trước khi đưa ra quyết định.
              </p>
            </div>

            {/* Segmented Control for Engine Modes */}
            <div className={s.segmentedWrap}>
              <div className={s.segmentedControl} role="group" aria-label="Chọn nguồn đánh giá">
                {(['AI', 'RULE', 'RULE_FALLBACK'] as const).map(value => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSource(value)}
                    aria-pressed={source === value}
                    className={`${s.segmentedTab} ${source === value ? s.segmentedTabActive : ''}`}
                  >
                    <span>{value}</span> {detectionModes[value].label}
                  </button>
                ))}
              </div>
            </div>

            <div className={s.detectionWindow} aria-live="polite">
              <div className={s.detectionThreeCol}>
                <div className={s.caseSheet}>
                  <div className={s.sheetHeader}>
                    <span className={s.sheetNum}>Đầu vào</span>
                    <span>Cách nhận dữ liệu</span>
                  </div>
                  <h3>Nhận giao dịch từ nhiều kênh</h3>
                  <p>Hỗ trợ kết nối tự động từ website, ứng dụng hoặc tải lên bằng tệp Excel/CSV, hệ thống tự kiểm tra định dạng trước khi xử lý.</p>
                  <div style={{ marginTop: '16px', display: 'grid', gap: '8px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f5f5f7', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--muted)' }}>Kết nối</span>
                      <strong>API / Excel / CSV</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f5f5f7', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--muted)' }}>Phạm vi</span>
                      <strong>Hồ sơ riêng của doanh nghiệp</strong>
                    </div>
                  </div>
                </div>

                <div className={`${s.engineBox} ${source === 'RULE' ? s.engineBoxRule : source === 'RULE_FALLBACK' ? s.engineBoxFallback : ''}`}>
                  <div>
                    <div className={s.engineHead}>
                      <div className={s.engineIcon} aria-hidden="true">{source === 'AI' ? 'AI' : '{ }'}</div>
                      <span className={s.sourceLabel}>{currentDetection.badge}</span>
                    </div>
                    <h3>{currentDetection.title}</h3>
                    <p>{currentDetection.description}</p>
                  </div>
                  <div className={s.engineSignals}>
                    {currentDetection.signals.map(([k, v]) => (
                      <div className={s.engineSignalRow} key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={s.caseSheet}>
                  <div className={s.sheetHeader}>
                    <span className={s.sheetNum}>Đầu ra</span>
                    <span>Thông báo &amp; Hồ sơ</span>
                  </div>
                  <h3>Hỗ trợ con người ra quyết định</h3>
                  <p>Khi phát hiện giao dịch bất thường, hệ thống tạo thông báo cảnh báo kèm căn cứ để con người xử lý, tuyệt đối không tự ý hủy đơn làm mất khách.</p>
                  <div style={{ marginTop: '16px', display: 'grid', gap: '8px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f5f5f7', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--muted)' }}>Hành động</span>
                      <strong>Tạo cảnh báo &amp; Giao việc</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f5f5f7', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--muted)' }}>Quyết định</span>
                      <strong>Do nhân sự chốt duyệt</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 04: How FraudGuard Works */}
        <section className={s.section} id="vai-tro" aria-labelledby="roles-heading">
          <div className={s.container}>
            <div className={s.centerHeader}>
              <p className={s.sectionNumber}>04 / QUY TRÌNH VẬN HÀNH</p>
              <h2 id="roles-heading">Cách FraudGuard hoạt động</h2>
              <p className={s.centerSub}>
                Ba bước đơn giản từ khi nhận thông tin giao dịch đến kết quả xác minh rõ ràng, có căn cứ.
              </p>
            </div>

            <div className={s.howGrid}>
              {howSteps.map(item => (
                <div key={item.number} className={s.howCard}>
                  <div className={s.howBadge}>{item.number}</div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 05: Apple Solutions & Plans */}
        <section className={`${s.section} ${s.sectionSurface}`} id="goi-su-dung" aria-labelledby="plans-heading">
          <div className={s.container}>
            <div className={s.centerHeader}>
              <p className={s.sectionNumber}>05 / CÁC GÓI SỬ DỤNG</p>
              <h2 id="plans-heading">
                Chọn phương án kiểm soát<br />
                <span>phù hợp với quy mô kinh doanh</span>
              </h2>
              <p className={s.centerSub}>
                Doanh nghiệp có thể bắt đầu với gói cơ bản dùng bộ quy tắc tự động hoặc nâng cấp lên gói AI có sẵn phương án dự phòng liên tục.
              </p>
            </div>

            <div className={s.plansGrid}>
              {/* Plan 1: Basic */}
              <div className={s.planCard}>
                <div>
                  <span className={s.planCardTag}>BẮT ĐẦU NHANH</span>
                  <h3 className={s.planName}>Gói Cơ bản (Miễn phí)</h3>
                  <div className={s.planPrice}>0 đ <span style={{ fontSize: '15px', color: 'var(--muted)', fontWeight: 400 }}>/ tháng</span></div>
                  <p className={s.planDesc}>
                    Bộ quy tắc tự động do doanh nghiệp tự thiết lập, phù hợp cho các cửa hàng và doanh nghiệp nhỏ muốn chuẩn hóa quy trình.
                  </p>
                  <ul className={s.planFeatures}>
                    <li><Check /> Kiểm tra theo bộ quy tắc do bạn đặt ra</li>
                    <li><Check /> Phân loại Bình thường / Bất thường / Chưa rõ</li>
                    <li><Check /> Chỉ rõ các điều kiện vi phạm trong giao dịch</li>
                    <li><Check /> Quản lý theo từng hồ sơ doanh nghiệp riêng biệt</li>
                    <li><Check /> Quy trình phối hợp xử lý hồ sơ 2 bước</li>
                  </ul>
                </div>
                <a className={`${s.planBtn} ${s.planBtnSecondary}`} href="#lien-he">
                  Bắt đầu miễn phí
                </a>
              </div>

              {/* Plan 2: Pro Subscription */}
              <div className={`${s.planCard} ${s.planCardFeatured}`}>
                <div>
                  <span className={s.planCardTag}>KHUYÊN DÙNG CHO SME TĂNG TRƯỞNG</span>
                  <h3 className={s.planName}>Gói Nâng cao (Đăng ký)</h3>
                  <div className={s.planPrice} style={{ color: 'var(--blue)' }}>
                    Liên hệ tư vấn
                  </div>
                  <p className={s.planDesc}>
                    Mô hình AI thông minh kết hợp bộ quy tắc dự phòng tự động, bảo vệ an toàn toàn diện cho doanh nghiệp đang mở rộng.
                  </p>
                  <ul className={s.planFeatures}>
                    <li><Check /> Toàn bộ tính năng có trong gói Cơ bản</li>
                    <li><Check /> Mô hình AI phân tích hành vi gian lận chuyên sâu</li>
                    <li><Check /> Báo cáo độ tin cậy AI &amp; giải trình căn cứ chi tiết</li>
                    <li><Check /> Tự động chuyển đổi quy tắc dự phòng khi AI gián đoạn</li>
                    <li><Check /> Đội ngũ kỹ thuật hỗ trợ thiết lập &amp; đồng hành 1-1</li>
                  </ul>
                </div>
                <a className={`${s.planBtn} ${s.planBtnPrimary}`} href="#lien-he">
                  Liên hệ nhận tư vấn gói Nâng cao
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Section 06: Apple FAQ */}
        <section className={s.section} id="giai-dap" aria-labelledby="faq-heading">
          <div className={`${s.container} ${s.faqWrap}`}>
            <div className={s.centerHeader}>
              <p className={s.sectionNumber}>06 / CÂU HỎI THƯỜNG GẶP</p>
              <h2 id="faq-heading">
                Giải đáp thắc mắc<br />
                <span>về FraudGuard</span>
              </h2>
              <p className={s.centerSub}>
                Những điều doanh nghiệp thường quan tâm về cách nhận diện giao dịch bất thường và quy trình triển khai.
              </p>
            </div>

            <div className={s.faqCard}>
              {questions.map(([question, answer], i) => (
                <details key={question}>
                  <summary>
                    <span className={s.faqNumber}>0{i + 1}</span>
                    <span>{question}</span>
                    <span className={s.faqPlus} aria-hidden="true" />
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Banner */}
        <section className={`${s.container} ${s.finalCta}`} id="lien-he" aria-labelledby="final-heading">
          <div>
            <p className={s.sectionNumber}>BẮT ĐẦU VỚI FRAUDGUARD</p>
            <h2 id="final-heading">
              Bảo vệ an toàn doanh thu<br />
              <span>và giao dịch của bạn ngay hôm nay</span>
            </h2>
            <p className={s.contactMeta}>
              Email: <strong>contact@fraudguard.vn</strong> · Hotline hỗ trợ: <strong>1900 6868</strong> (08:30 - 18:00)
            </p>
          </div>
          <div>
            <a className={s.primary} href="mailto:contact@fraudguard.vn">
              Liên hệ với chúng tôi <Arrow />
            </a>
            <p>Nhận tư vấn phương án kiểm soát rủi ro phù hợp nhất cho doanh nghiệp của bạn.</p>
          </div>
        </section>
      </main>

      {/* Apple Minimalist Footer */}
      <footer className={`${s.container} ${s.footer}`}>
        <div className={s.footerLeft}>
          <a className={s.brand} href="#" aria-label="FraudGuard, về đầu trang">
            <Shield small />
            <span>Fraud<span className={s.brandLight}>Guard</span></span>
          </a>
          <p>Nền tảng hỗ trợ nhận diện giao dịch bất thường và quản lý hồ sơ kiểm soát rủi ro cho doanh nghiệp SME.</p>
        </div>
        <div className={s.footerRight}>
          <span>Phân định rõ trách nhiệm. Xử lý dựa trên bằng chứng minh bạch.</span>
          <a href="#giai-dap">Câu hỏi thường gặp</a>
          <a href="#">Về đầu trang ↑</a>
        </div>
      </footer>
    </div>
  );
}
