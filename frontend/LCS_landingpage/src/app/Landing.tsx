'use client';

import { useEffect, useRef, useState } from 'react';
import s from './landing.module.css';

function Shield({ small = false }: { small?: boolean }) {
  return <svg width={small ? 21 : 28} height={small ? 24 : 31} viewBox="0 0 24 26" fill="none" aria-hidden="true"><path d="M12 2 21 6v7c0 5-5 9-9 11-4-2-9-6-9-11V6l9-4Z" stroke="currentColor" strokeWidth="1.7"/><path d="m8 13 3 3 5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function Arrow() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function Check() { return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }

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
    badge: 'AI',
    label: 'Trí tuệ nhân tạo (AI)',
    title: 'Phát hiện bằng AI + Giải thích lý do',
    description: 'Dành cho gói Nâng cao. AI tự động phân tích hành vi phức tạp để nhận diện giao dịch Bất thường hay Bình thường, kèm mức độ tin cậy và giải thích rõ vì sao nghi vấn.',
    signals: [
      ['Kết quả kiểm tra', 'Bất thường (Cần lưu ý)'],
      ['Độ tin cậy của AI', '91% (Rất đáng ngờ)'],
      ['Căn cứ kèm theo', 'Giải thích chi tiết các điểm bất thường'],
    ],
  },
  RULE: {
    badge: 'QUY TẮC',
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
    description: 'Thiết lập khu vực riêng cho doanh nghiệp, kết nối nhận dữ liệu tự động hoặc tải tệp giao dịch lên hệ thống.',
  },
  {
    number: '2',
    title: 'Hệ thống tự động kiểm tra',
    description: 'Hệ thống đối chiếu giao dịch qua AI và bộ quy tắc, phân loại kết quả và gửi thông báo nếu có dấu hiệu bất thường.',
  },
  {
    number: '3',
    title: 'Xác minh & duyệt quyết định',
    description: 'Nhân viên kiểm tra bằng chứng thực tế, ghi lại ý kiến và cấp quản lý phê duyệt hướng xử lý cuối cùng.',
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
  const [motionReady, setMotionReady] = useState(false);
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<'AI' | 'RULE' | 'RULE_FALLBACK'>('AI');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-scroll-section]'));
    const revealItems = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (typeof IntersectionObserver === 'undefined') {
      sections.forEach(el => el.classList.add(s.inView));
      revealItems.forEach(el => {
        el.classList.add(s.isRevealed);
        el.setAttribute('data-revealed', 'true');
      });
      return;
    }
    setMotionReady(true);
    const sectionObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add(s.inView);
          } else if (entry.boundingClientRect.top > window.innerHeight * 0.92) {
            entry.target.classList.remove(s.inView);
          }
        });
      },
      { rootMargin: '0px 0px -4% 0px', threshold: 0.05 }
    );
    const itemObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add(s.isRevealed);
            entry.target.setAttribute('data-revealed', 'true');
          } else if (entry.boundingClientRect.top > window.innerHeight * 0.9) {
            entry.target.classList.remove(s.isRevealed);
            entry.target.removeAttribute('data-revealed');
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 }
    );
    sections.forEach(el => sectionObserver.observe(el));
    revealItems.forEach(el => itemObserver.observe(el));
    return () => {
      sectionObserver.disconnect();
      itemObserver.disconnect();
    };
  }, []);

  const currentStep = steps[step];
  const currentDetection = detectionModes[source];

  return <div ref={rootRef} className={`${s.pageRoot} ${motionReady ? s.motionReady : ''}`}>
    <a className={s.skip} href="#main">Đến nội dung chính</a>
    <header className={`${s.header} ${scrolled ? s.headerScrolled : ''}`}>
      <div className={s.headerInner}>
        <a className={s.brand} href="#" aria-label="FraudGuard, đầu trang"><Shield/><span>Fraud<span className={s.brandLight}>Guard</span></span></a>
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
          <a className={s.navCta} href="#lien-he" onClick={() => setMenuOpen(false)}>Liên hệ với chúng tôi <Arrow/></a>
        </nav>
      </div>
    </header>

    <main id="main">
      <div className={s.heroWrap}>
        <section className={`${s.container} ${s.hero}`} id="san-pham" aria-labelledby="hero-heading">
          <div className={s.heroCopy}>
            <p className={s.kickerPill}><span className={s.liveDot} aria-hidden="true"/><Shield small/> FraudGuard · Nền tảng kiểm soát rủi ro giao dịch</p>
            <h1 id="hero-heading">Quy trình rõ ràng.<br/><span>Kiểm soát rủi ro liền mạch.</span></h1>
            <p className={s.heroDescription}>
              Kết nối theo dõi giao dịch đa kênh, nhận diện sớm dấu hiệu bất thường và xử lý hồ sơ tập trung trong một quy trình thống nhất. Mọi bước đều có bằng chứng rõ ràng, người chịu trách nhiệm và lịch sử ghi nhận đầy đủ.
            </p>
            <div className={s.actions}>
              <a className={s.primary} href="#lien-he">Liên hệ với chúng tôi <Arrow/></a>
              <a className={s.secondary} href="#ho-so">Xem luồng hồ sơ điều tra</a>
            </div>
            <div className={s.heroHighlights} aria-label="Nguyên tắc cốt lõi">
              <div className={s.heroHighlightItem}><Check/> <span>Phân loại giao dịch rõ ràng</span></div>
              <div className={s.heroHighlightItem}><Check/> <span>Bằng chứng gắn liền từng hồ sơ</span></div>
              <div className={s.heroHighlightItem}><Check/> <span>Phối hợp xác minh &amp; phê duyệt minh bạch</span></div>
            </div>
          </div>
        </section>
      </div>

      <section className={`${s.sectionPastelWarm} ${s.scrollSection}`} data-scroll-section id="tinh-nang" aria-labelledby="features-heading">
        <div className={s.container}>
        <div className={`${s.centerHeader} ${s.revealFadeBlur}`} data-reveal>
          <p className={s.sectionNumber}>01 / QUY TRÌNH KIỂM SOÁT RỦI RO</p>
          <h2 id="features-heading">Đánh giá chuẩn xác,<br/><span>vận hành xuyên suốt</span></h2>
          <p className={s.centerSub}>
            Từ cổng thanh toán, ví điện tử đến đơn hàng giao tận nơi (COD), mỗi doanh nghiệp đều có quy tắc riêng nhưng chung một quy trình kiểm soát, rà soát và đối chiếu minh bạch.
          </p>
        </div>

        <div className={s.featureGrid}>
          <article className={`${s.featureCard} ${s.revealSlideLeft}`} data-reveal>
            <div className={s.featureTop}>
              <span className={s.featureNum}>01</span>
              <h3>Phân loại kết quả giao dịch rõ ràng</h3>
              <p>Tự động phân loại từng giao dịch thành Bình thường, Bất thường hoặc Cần kiểm tra thêm, kèm theo lý do và dấu hiệu cụ thể để nhân viên dễ dàng đối chiếu.</p>
            </div>
          </article>

          <article className={`${s.featureCard} ${s.revealFadeUp} ${s.delay1}`} data-reveal>
            <div className={s.featureTop}>
              <span className={s.featureNum}>02</span>
              <h3>Kết hợp AI và bộ quy tắc linh hoạt</h3>
              <p>Áp dụng công nghệ trí tuệ nhân tạo (AI) cùng các quy tắc do doanh nghiệp đặt ra, tự động chuyển đổi phương án dự phòng để quy trình đánh giá không bao giờ bị gián đoạn.</p>
            </div>
          </article>

          <article className={`${s.featureCard} ${s.revealSlideRight} ${s.delay2}`} data-reveal>
            <div className={s.featureTop}>
              <span className={s.featureNum}>03</span>
              <h3>Không gian làm việc độc lập</h3>
              <p>Mỗi doanh nghiệp sở hữu một khu vực làm việc riêng biệt, dữ liệu được bảo mật tách biệt hoàn toàn, tự quản lý nhân viên và thiết lập phạm vi theo dõi riêng.</p>
            </div>
          </article>

          <article className={`${s.featureCard} ${s.revealSlideLeft}`} data-reveal>
            <div className={s.featureTop}>
              <span className={s.featureNum}>04</span>
              <h3>Chạy thử an toàn trước khi áp dụng thực tế</h3>
              <p>Cho phép thiết lập và kiểm tra thử nghiệm các quy tắc kiểm soát trên dữ liệu mẫu trước khi đưa vào hoạt động chính thức, tránh chặn nhầm khách hàng.</p>
            </div>
          </article>

          <article className={`${s.featureCard} ${s.revealFadeUp} ${s.delay1}`} data-reveal>
            <div className={s.featureTop}>
              <span className={s.featureNum}>05</span>
              <h3>Quy trình xác minh và phê duyệt hai bước</h3>
              <p>Phân định rõ trách nhiệm giữa nhân viên kiểm tra bằng chứng thực tế và cấp quản lý phê duyệt quyết định cuối cùng trên từng trường hợp nghi vấn.</p>
            </div>
          </article>

          <article className={`${s.featureCard} ${s.revealSlideRight} ${s.delay2}`} data-reveal>
            <div className={s.featureTop}>
              <span className={s.featureNum}>06</span>
              <h3>Ghi nhận lịch sử xử lý minh bạch</h3>
              <p>Lưu lại toàn bộ lịch sử thao tác, từ thay đổi cài đặt đến người đưa ra quyết định xử lý, giúp việc kiểm tra và đối chiếu nội bộ luôn rõ ràng.</p>
            </div>
          </article>
        </div>
        </div>
      </section>

      <section className={`${s.sectionAlt} ${s.scrollSection}`} data-scroll-section id="ho-so" aria-labelledby="story-heading">
        <div className={s.container}>
          <div className={`${s.centerHeader} ${s.revealFadeBlur}`} data-reveal>
            <p className={s.sectionNumber}>02 / QUẢN LÝ HỒ SƠ TẬP TRUNG</p>
            <h2 id="story-heading">Một hồ sơ xử lý,<br/><span>toàn bộ thông tin trên một màn hình</span></h2>
            <p className={s.centerSub}>
              Từ lúc phát hiện giao dịch bất thường đến khi kết luận, nhân viên kiểm tra và cấp quản lý đều xem chung một hồ sơ thống nhất, không sợ thất lạc thông tin.
            </p>
          </div>

          <div className={`${s.pillBar} ${s.revealFadeBlur}`} data-reveal role="group" aria-label="Các bước trong tình huống">
            {steps.map((item, i) => (
              <button
                key={item.name}
                type="button"
                aria-pressed={step === i}
                onClick={() => setStep(i)}
                className={`${s.pillBtn} ${step === i ? s.pillBtnActive : ''}`}
              >
                <span>0{i + 1}</span> {item.name}
              </button>
            ))}
          </div>

          <div className={s.hubGrid} aria-live="polite">
            <div className={`${s.hubCol} ${s.hubColLeft} ${s.revealSlideLeft}`} data-reveal>
              <article onClick={() => setStep(0)} className={`${s.caseSheet} ${currentStep.cardIndex === 0 ? s.caseSheetActive : ''}`}>
                <div className={s.sheetHeader}>
                  <span className={s.sheetNum}>01</span>
                  <span>Thông tin giao dịch ban đầu</span>
                </div>
                <h3>Thông tin ban đầu từ doanh nghiệp</h3>
                <p>Tập hợp thông tin giao dịch, kênh thanh toán và các yếu tố liên quan để nhân viên có cái nhìn tổng quát ngay từ đầu.</p>
              </article>

              <article onClick={() => setStep(1)} className={`${s.caseSheet} ${currentStep.cardIndex === 1 ? s.caseSheetActive : ''}`}>
                <div className={s.sheetHeader}>
                  <span className={s.sheetNum}>02</span>
                  <span>Dấu hiệu cảnh báo</span>
                </div>
                <h3>Lý do giao dịch cần kiểm tra</h3>
                <p>Hiển thị rõ các dấu hiệu bất thường hoặc điều kiện cảnh báo để nhân viên biết chính xác vì sao giao dịch cần được xem xét.</p>
              </article>
            </div>

            <div className={`${s.hubCenter} ${s.revealZoomIn} ${s.delay1}`} data-reveal>
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

              <div className={s.stepPagination}>
                <span>0{step + 1} <span>/ 04 · Quy trình xử lý hồ sơ</span></span>
                <button
                  type="button"
                  className={s.circleBtn}
                  onClick={() => setStep((step + 1) % steps.length)}
                  aria-label={step === 3 ? 'Xem lại từ giao dịch' : 'Xem bước tiếp theo'}
                >
                  <Arrow/>
                </button>
              </div>
            </div>

            <div className={`${s.hubCol} ${s.hubColRight} ${s.revealSlideRight} ${s.delay2}`} data-reveal>
              <article onClick={() => setStep(2)} className={`${s.caseSheet} ${currentStep.cardIndex === 2 ? s.caseSheetActive : ''}`}>
                <div className={s.sheetHeader}>
                  <span className={s.sheetNum}>03</span>
                  <span>Báo cáo xác minh</span>
                </div>
                <h3>Đề xuất phương án có căn cứ</h3>
                <p>Nhân viên ghi lại kết quả kiểm tra thực tế, đính kèm nhận định và gửi đề xuất phương án xử lý lên người quản lý.</p>
              </article>

              <article onClick={() => setStep(3)} className={`${s.caseSheet} ${currentStep.cardIndex === 3 ? s.caseSheetActive : ''}`}>
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

      <section className={`${s.sectionPastelWarm} ${s.scrollSection}`} data-scroll-section id="co-che" aria-labelledby="detection-heading">
        <div className={s.container}>
        <div className={`${s.centerHeader} ${s.revealFadeBlur}`} data-reveal>
          <p className={s.sectionNumber}>03 / CÁCH HỆ THỐNG PHÁT HIỆN GIAN LẬN</p>
          <h2 id="detection-heading">Kết quả kiểm tra rõ ràng.<br/><span>Có căn cứ. Có giải thích.</span></h2>
          <p className={s.centerSub}>
            Biết chính xác giao dịch được phát hiện nhờ trí tuệ nhân tạo (AI), bộ quy tắc kiểm tra tự động hay phương án dự phòng trước khi đưa ra quyết định.
          </p>
        </div>

        <div className={`${s.pillBar} ${s.revealFadeBlur}`} data-reveal role="group" aria-label="Chọn nguồn đánh giá">
          {(['AI', 'RULE', 'RULE_FALLBACK'] as const).map(value => (
            <button
              key={value}
              type="button"
              onClick={() => setSource(value)}
              aria-pressed={source === value}
              className={`${s.pillBtn} ${source === value ? s.pillBtnActive : ''}`}
            >
              <span>{value}</span> {detectionModes[value].label}
            </button>
          ))}
        </div>

        <div className={s.detectionWindow} aria-live="polite">
          <div className={s.detectionThreeCol}>
            <div className={`${s.caseSheet} ${s.detectColLeft} ${s.revealSlideLeft}`} data-reveal>
              <div className={s.sheetHeader}>
                <span className={s.sheetNum}>Đầu vào</span>
                <span>Cách nhận dữ liệu</span>
              </div>
              <h3>Nhận giao dịch từ nhiều kênh</h3>
              <p>Hỗ trợ kết nối tự động từ website, ứng dụng hoặc tải lên bằng tệp Excel/CSV, hệ thống tự kiểm tra định dạng trước khi xử lý.</p>
              <dl>
                <div><dt>Cách kết nối</dt><dd>Tự động (API) / Tệp Excel / CSV</dd></div>
                <div><dt>Phạm vi</dt><dd>Không gian riêng của doanh nghiệp</dd></div>
                <div><dt>Kiểm tra trước</dt><dd>Tự động kiểm tra tính hợp lệ</dd></div>
              </dl>
            </div>

            <div className={`${s.engineBox} ${source === 'RULE' ? s.engineBoxRule : source === 'RULE_FALLBACK' ? s.engineBoxFallback : ''} ${s.revealZoomIn} ${s.delay1}`} data-reveal>
              <div className={s.engineContent} key={source}>
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
            </div>

            <div className={`${s.caseSheet} ${s.detectColRight} ${s.revealSlideRight} ${s.delay2}`} data-reveal>
              <div className={s.sheetHeader}>
                <span className={s.sheetNum}>Đầu ra</span>
                <span>Thông báo &amp; Hồ sơ</span>
              </div>
              <h3>Hỗ trợ con người ra quyết định</h3>
              <p>Khi phát hiện giao dịch bất thường, hệ thống tạo thông báo cảnh báo kèm căn cứ để con người xử lý, tuyệt đối không tự ý hủy đơn làm mất khách.</p>
              <dl>
                <div><dt>Khi có bất thường</dt><dd>Tạo thông báo &amp; đưa vào danh sách chờ</dd></div>
                <div><dt>Căn cứ kèm theo</dt><dd>Đính kèm đầy đủ vào hồ sơ</dd></div>
                <div><dt>Quyết định cuối</dt><dd>Do người phụ trách đưa ra</dd></div>
              </dl>
            </div>
          </div>
        </div>
        </div>
      </section>

      <section className={`${s.sectionAlt} ${s.scrollSection}`} data-scroll-section id="vai-tro" aria-labelledby="roles-heading">
        <div className={s.container}>
          <div className={`${s.centerHeader} ${s.revealFadeBlur}`} data-reveal>
            <p className={s.sectionNumber}>04 / QUY TRÌNH VẬN HÀNH</p>
            <h2 id="roles-heading">Cách FraudGuard hoạt động</h2>
            <p className={s.centerSub}>
              Ba bước đơn giản từ khi nhận thông tin giao dịch đến kết quả xác minh rõ ràng, có căn cứ.
            </p>
          </div>

          <div className={s.howGrid}>
            {howSteps.map((item, i) => (
              <div
                key={item.number}
                className={`${s.howStep} ${s.revealFadeUp} ${i === 1 ? s.delay1 : i === 2 ? s.delay2 : ''}`}
                data-reveal
              >
                <div className={s.howStepTop}>
                  <span className={s.howStepBadge}>{item.number}</span>
                  <span className={s.howStepLine} aria-hidden="true" />
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.container} ${s.section} ${s.plans} ${s.scrollSection}`} data-scroll-section id="goi-su-dung" aria-labelledby="plans-heading">
        <div className={`${s.planIntro} ${s.revealSlideLeft}`} data-reveal>
          <p className={s.sectionNumber}>05 / CÁC GÓI SỬ DỤNG</p>
          <h2 id="plans-heading">Chọn phương án kiểm soát<br/><span>phù hợp với quy mô kinh doanh</span></h2>
          <p>Doanh nghiệp có thể bắt đầu với gói cơ bản dùng bộ quy tắc tự động hoặc nâng cấp lên gói AI có sẵn phương án dự phòng liên tục.</p>
          <a className={s.textLink} href="#lien-he">Liên hệ để được tư vấn gói phù hợp <Arrow/></a>
        </div>

        <div className={`${s.planTableWrap} ${s.revealSlideRight} ${s.delay1}`} data-reveal>
          <table className={s.planTable}>
            <caption className={s.srOnly}>So sánh hai phương án Free và Subscription theo đặc tả FraudGuard</caption>
            <thead>
              <tr>
                <th scope="col">Tính năng</th>
                <th scope="col"><span>Gói Cơ bản (Miễn phí)</span>Bộ quy tắc tự động</th>
                <th scope="col"><span>Gói Nâng cao (Đăng ký)</span>AI thông minh + Quy tắc dự phòng</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Phương thức kiểm tra chính', 'Bộ quy tắc do bạn đặt ra', 'Mô hình AI kết hợp bộ quy tắc thông minh'],
                ['Kết quả phân loại', 'Bình thường / Bất thường / Chưa rõ', 'Bình thường / Bất thường + Độ tin cậy của AI'],
                ['Căn cứ và giải thích', 'Chỉ rõ quy tắc nào bị vi phạm', 'Giải thích chi tiết các điểm đáng ngờ bằng AI'],
                ['Khi hệ thống AI gặp sự cố', 'Không áp dụng', 'Tự động chuyển sang quy tắc dự phòng'],
                ['Quy trình phối hợp xử lý hồ sơ', 'Đầy đủ danh sách chờ và phân công xử lý', 'Đầy đủ danh sách chờ và phân công xử lý'],
              ].map(row => (
                <tr key={row[0]}>
                  <th scope="row">{row[0]}</th>
                  <td>{row[1]}</td>
                  <td>{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${s.sectionAlt} ${s.scrollSection}`} data-scroll-section id="giai-dap" aria-labelledby="faq-heading">
        <div className={`${s.container} ${s.faqWrap}`}>
          <div className={`${s.centerHeader} ${s.revealFadeBlur}`} data-reveal>
            <p className={s.sectionNumber}>06 / CÂU HỎI THƯỜNG GẶP</p>
            <h2 id="faq-heading">Giải đáp thắc mắc<br/><span>về FraudGuard</span></h2>
            <p className={s.centerSub}>Những điều doanh nghiệp thường quan tâm về cách nhận diện giao dịch bất thường và quy trình triển khai.</p>
          </div>

          <div className={`${s.faqCard} ${s.revealZoomIn}`} data-reveal>
            {questions.map(([question, answer], i) => (
              <details key={question}>
                <summary>
                  <span className={s.faqNumber}>0{i + 1}</span>
                  <span>{question}</span>
                  <span className={s.faqPlus} aria-hidden="true"/>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.container} ${s.finalCta} ${s.scrollSection} ${s.revealZoomIn}`} id="lien-he" data-scroll-section data-reveal aria-labelledby="final-heading">
        <div>
          <p className={s.sectionNumber}>BẮT ĐẦU VỚI FRAUDGUARD</p>
          <h2 id="final-heading">Bảo vệ an toàn doanh thu<br/><span>và giao dịch của bạn ngay hôm nay</span></h2>
          <p className={s.contactMeta}>Email: <strong>contact@fraudguard.vn</strong> · Hotline hỗ trợ: <strong>1900 6868</strong> (08:30 - 18:00)</p>
        </div>
        <div>
          <a className={s.primary} href="mailto:contact@fraudguard.vn">Liên hệ với chúng tôi <Arrow/></a>
          <p>Nhận tư vấn phương án kiểm soát rủi ro phù hợp nhất cho doanh nghiệp của bạn.</p>
        </div>
      </section>
    </main>

    <footer className={`${s.container} ${s.footer} ${s.scrollSection}`} data-scroll-section>
      <div className={`${s.footerLeft} ${s.revealSlideLeft}`} data-reveal>
        <a className={s.brand} href="#" aria-label="FraudGuard, về đầu trang"><Shield small/><span>Fraud<span className={s.brandLight}>Guard</span></span></a>
        <p>Nền tảng hỗ trợ nhận diện giao dịch bất thường và quản lý hồ sơ kiểm soát rủi ro cho doanh nghiệp.</p>
      </div>
      <div className={`${s.footerRight} ${s.revealSlideRight} ${s.delay1}`} data-reveal>
        <span>Phân định rõ trách nhiệm. Xử lý dựa trên bằng chứng minh bạch.</span>
        <a href="#giai-dap">Câu hỏi thường gặp</a>
        <a href="#">Về đầu trang ↑</a>
      </div>
    </footer>
  </div>;
}
