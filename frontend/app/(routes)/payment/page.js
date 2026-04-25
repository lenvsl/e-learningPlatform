'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import './payment.css';

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course');

  const [course, setCourse]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying]   = useState(false);
  const [error, setError]     = useState(null);
  const [done, setDone]       = useState(false);
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);

  // Card form state
  const [card, setCard] = useState({
    name: '',
    number: '',
    expiry: '',
    cvv: '',
  });

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    if (!token) { router.push('/login'); return; }

    try {
      const payload = JSON.parse(decodeURIComponent(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')));
      if (payload.role !== 'student') { router.push('/dashboard'); return; }
    } catch { router.push('/login'); return; }

    if (!courseId) { router.push('/courses'); return; }

    Promise.all([
      fetch(`http://localhost:5000/api/courses/${courseId}`).then(r => r.json()),
      fetch('http://localhost:5000/api/my-enrollments', {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()).catch(() => []),
    ]).then(([courseData, enrollments]) => {
      setCourse(courseData);
      if (Array.isArray(enrollments)) {
        const enrolled = enrollments.some(e => String(e.course_id) === String(courseId));
        setAlreadyEnrolled(enrolled);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [courseId]);

  // Formatters
  const fmtNumber = (v) =>
    v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();

  const fmtExpiry = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
  };

  const handleChange = (field, value) => {
    if (field === 'number') value = fmtNumber(value);
    if (field === 'expiry') value = fmtExpiry(value);
    if (field === 'cvv')    value = value.replace(/\D/g, '').slice(0, 3);
    setCard(prev => ({ ...prev, [field]: value }));
  };

  const isFormValid = card.name && card.number.replace(/\s/g,'').length === 16
    && card.expiry.length === 5 && card.cvv.length === 3;

  const handlePay = async () => {
    if (!isFormValid) return;
    const token = sessionStorage.getItem('token');
    setPaying(true);
    setError(null);

    try {
      // Simulate payment delay
      await new Promise(r => setTimeout(r, 1800));

      // Enroll
      const res = await fetch(`http://localhost:5000/api/courses/${courseId}/enroll`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (res.ok) {
        setDone(true);
        setTimeout(() => router.push('/dashboard'), 2500);
      } else {
        setError(data.error || 'Σφάλμα εγγραφής');
      }
    } catch {
      setError('Σφάλμα σύνδεσης. Δοκιμάστε ξανά.');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return (
    <div className="pay-loading"><div className="pay-spinner" /><p>Φόρτωση...</p></div>
  );

  if (alreadyEnrolled) return (
    <div className="pay-already">
      <div className="pay-already-icon">✅</div>
      <h2>Είστε ήδη εγγεγραμμένοι</h2>
      <p>Έχετε ήδη πρόσβαση στο <strong>{course?.title}</strong>.</p>
      <div className="pay-already-actions">
        <a href={`/courses/${courseId}`} className="pay-already-btn-primary">
          📖 Πήγαινε στο Μάθημα
        </a>
        <a href="/dashboard" className="pay-already-btn-secondary">
          📚 Dashboard
        </a>
      </div>
    </div>
  );

  if (done) return (
    <div className="pay-success">
      <div className="pay-success-icon">✅</div>
      <h2>Πληρωμή επιτυχής!</h2>
      <p>Εγγραφήκατε στο <strong>{course?.title}</strong>.</p>
      <p className="pay-redirect">Μεταφορά στο dashboard...</p>
    </div>
  );

  if (!course) return (
    <div className="pay-loading"><p>Το μάθημα δεν βρέθηκε.</p></div>
  );

  return (
    <div className="pay-page">

      <div className="pay-header">
        <h1>Ολοκλήρωση Πληρωμής</h1>
      </div>

      <div className="pay-body">

        {/* Left: Card form */}
        <div className="pay-form-wrap">

          {/* Card preview */}
          <div className="pay-card-preview">
            <div className="pay-card-chip">💳</div>
            <div className="pay-card-number">
              {card.number || '•••• •••• •••• ••••'}
            </div>
            <div className="pay-card-bottom">
              <div>
                <p>Κάτοχος</p>
                <strong>{card.name || 'ΟΝΟΜΑ ΚΑΤΟΧΟΥ'}</strong>
              </div>
              <div>
                <p>Λήξη</p>
                <strong>{card.expiry || 'MM/YY'}</strong>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="pay-form">
            <p className="pay-form-label">🔒 Στοιχεία Κάρτας</p>

            <div className="pay-field">
              <label>Όνομα Κατόχου</label>
              <input
                type="text"
                placeholder="ΓΙΩΡΓΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ"
                value={card.name}
                onChange={e => handleChange('name', e.target.value.toUpperCase())}
                maxLength={26}
              />
            </div>

            <div className="pay-field">
              <label>Αριθμός Κάρτας</label>
              <input
                type="text"
                placeholder="1234 5678 9012 3456"
                value={card.number}
                onChange={e => handleChange('number', e.target.value)}
                inputMode="numeric"
              />
            </div>

            <div className="pay-field-row">
              <div className="pay-field">
                <label>Ημερομηνία Λήξης</label>
                <input
                  type="text"
                  placeholder="MM/YY"
                  value={card.expiry}
                  onChange={e => handleChange('expiry', e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="pay-field">
                <label>CVV</label>
                <input
                  type="password"
                  placeholder="•••"
                  value={card.cvv}
                  onChange={e => handleChange('cvv', e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>

            {error && <p className="pay-error">{error}</p>}

            <button
              className="pay-submit-btn"
              onClick={handlePay}
              disabled={paying || !isFormValid}
            >
              {paying
                ? <><span className="pay-btn-spinner" /> Επεξεργασία...</>
                : `💳 Πληρωμή ${course.price} ${course.currency || '€'}`
              }
            </button>

          </div>
        </div>

        {/* Right: Order summary */}
        <aside className="pay-summary">
          <h3>Σύνοψη Παραγγελίας</h3>

          <div className="pay-summary-course">
            <p className="pay-summary-title">{course.title}</p>
            <p className="pay-summary-inst">{course.institution_name}</p>
            <p className="pay-summary-lecturer">👤 {course.lecturer_name}</p>
          </div>

          <div className="pay-summary-lines">
            <div className="pay-summary-row">
              <span>Τιμή μαθήματος</span>
              <span>{course.price} {course.currency || '€'}</span>
            </div>
            <div className="pay-summary-row">
              <span>ΦΠΑ (24%)</span>
              <span>συμπεριλαμβάνεται</span>
            </div>
          </div>

          <div className="pay-summary-total">
            <span>Σύνολο</span>
            <strong>{course.price} {course.currency || '€'}</strong>
          </div>

        </aside>

      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="pay-loading"><div className="pay-spinner" /></div>}>
      <PaymentContent />
    </Suspense>
  );
}