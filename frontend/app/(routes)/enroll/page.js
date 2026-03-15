'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import './enroll.css';

const DIFFICULTY_LABELS = {
  beginner:     { label: 'Αρχάριος',     color: 'diff-beginner' },
  intermediate: { label: 'Μέσος',        color: 'diff-intermediate' },
  advanced:     { label: 'Προχωρημένος', color: 'diff-advanced' },
};

const formatDuration = (mins) => {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}ω ${m > 0 ? m + 'λ' : ''}`.trim() : `${m}λ`;
};

function EnrollContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course');

  const [user, setUser]       = useState(null);
  const [course, setCourse]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError]     = useState(null);
  const [done, setDone]       = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    if (!token) {
      router.push(`/login?redirect=/enroll${courseId ? `?course=${courseId}` : ''}`);
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role !== 'student') {
        router.push('/dashboard');
        return;
      }
      setUser(payload);
    } catch {
      router.push('/login');
      return;
    }

    if (!courseId) {
      // Δεν έχει course param — φόρτωσε όλα τα courses για επιλογή
      fetch('http://localhost:5000/api/courses')
        .then(r => r.json())
        .then(data => { setCourse(null); setLoading(false); })
        .catch(() => setLoading(false));
      setLoading(false);
      return;
    }

    fetch(`http://localhost:5000/api/courses/${courseId}`)
      .then(r => r.json())
      .then(data => { setCourse(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [courseId]);

  const handleEnroll = async () => {
    const token = sessionStorage.getItem('token');

    // Αν έχει τιμή → πήγαινε στην οθόνη πληρωμής
    const isFree = !course?.price || course.price === '0.00';
    if (!isFree) {
      router.push(`/payment?course=${courseId}`);
      return;
    }

    setEnrolling(true);
    setError(null);
    try {
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
      setEnrolling(false);
    }
  };

  // ── Loading ──
  if (loading) return (
    <div className="enroll-loading">
      <div className="enroll-spinner" />
      <p>Φόρτωση...</p>
    </div>
  );

  // ── Success ──
  if (done) return (
    <div className="enroll-success">
      <div className="enroll-success-icon">🎉</div>
      <h2>Εγγραφή επιτυχής!</h2>
      <p>Καλωσήρθες στο <strong>{course?.title}</strong>.</p>
      <p className="enroll-redirect-note">Μεταφορά στο dashboard...</p>
    </div>
  );

  // ── No course selected — show picker ──
  if (!courseId) return <CoursePicker user={user} />;

  // ── Course not found ──
  if (!course || course.error) return (
    <div className="enroll-loading">
      <p>Το μάθημα δεν βρέθηκε.</p>
      <Link href="/courses" className="enroll-back-link">← Επιστροφή στα μαθήματα</Link>
    </div>
  );

  const diff = DIFFICULTY_LABELS[course.difficulty] || { label: course.difficulty, color: '' };
  const isFree = !course.price || course.price === '0.00';
  const totalLessons = course.sections?.reduce((s, sec) => s + (sec.lessons?.length || 0), 0) || 0;

  return (
    <div className="enroll-page">

      {/* Header */}
      <div className="enroll-header">
        <Link href={`/courses/${courseId}`} className="enroll-back">← Πίσω στο μάθημα</Link>
        <h1>Επιβεβαίωση Εγγραφής</h1>
        <p>Ελέγξτε τα στοιχεία και ολοκληρώστε την εγγραφή σας</p>
      </div>

      <div className="enroll-body">

        {/* Course card */}
        <div className="enroll-course-card">
          <div className="enroll-course-badges">
            <span className="enroll-category">{course.category_name || '—'}</span>
            <span className={`enroll-diff ${diff.color}`}>{diff.label}</span>
          </div>
          <h2>{course.title}</h2>
          <p className="enroll-course-desc">{course.short_description}</p>

          <div className="enroll-course-meta">
            <div><span>👤</span><span>{course.lecturer_name || '—'}</span></div>
            <div><span>🏛</span><span>{course.institution_name || '—'}</span></div>
            <div><span>⏱</span><span>{formatDuration(course.duration_minutes)}</span></div>
            <div><span>📖</span><span>{totalLessons} μαθήματα</span></div>
            <div><span>👥</span><span>{course.enrolled_count || 0} εγγεγραμμένοι</span></div>
          </div>
        </div>

        {/* Confirm panel */}
        <div className="enroll-confirm-panel">
          <h3>Στοιχεία Εγγραφής</h3>

          <div className="enroll-user-info">
            <div className="enroll-avatar">
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </div>
            <div>
              <strong>{user?.first_name} {user?.last_name}</strong>
              <p>{user?.email}</p>
            </div>
          </div>

          <div className="enroll-summary">
            <div className="enroll-summary-row">
              <span>Μάθημα</span>
              <span>{course.title}</span>
            </div>
            <div className="enroll-summary-row">
              <span>Κόστος</span>
              <span className={isFree ? 'enroll-free' : ''}>
                {isFree ? 'Δωρεάν' : `${course.price} ${course.currency || '€'}`}
              </span>
            </div>
            <div className="enroll-summary-row">
              <span>Πρόσβαση</span>
              <span>Άμεση</span>
            </div>
          </div>

          {error && <p className="enroll-error">{error}</p>}

          <button
            className="enroll-submit-btn"
            onClick={handleEnroll}
            disabled={enrolling}
          >
            {enrolling
              ? 'Εγγραφή...'
              : isFree
                ? '🆓 Εγγραφή Δωρεάν'
                : `💳 Εγγραφή — ${course.price}€`
            }
          </button>

          <p className="enroll-cancel-note">
            Μπορείτε να διαγραφείτε οποιαδήποτε στιγμή από το dashboard σας.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Course picker (αν δεν έχει ?course= param) ──
function CoursePicker({ user }) {
  const router = useRouter();
  const [courses, setCourses] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [activeInst, setActiveInst] = useState('all');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('http://localhost:5000/api/courses').then(r => r.json()),
      fetch('http://localhost:5000/api/institutions').then(r => r.json()),
    ]).then(([c, i]) => {
      setCourses(Array.isArray(c) ? c : []);
      setInstitutions(Array.isArray(i) ? i : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = courses.filter(c => {
    const matchInst = activeInst === 'all' || String(c.institution_id) === String(activeInst);
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase());
    return matchInst && matchSearch;
  });

  return (
    <div className="enroll-picker-page">
      <div className="enroll-header">
        <h1>Επιλογή Μαθήματος</h1>
        <p>Διαλέξτε το μάθημα που σας ενδιαφέρει για εγγραφή</p>
      </div>

      <div className="enroll-picker-layout">
        {/* Sidebar institutions */}
        <aside className="enroll-picker-sidebar">
          <p className="enroll-sidebar-label">Τμήματα</p>
          <button
            className={`enroll-inst-btn ${activeInst === 'all' ? 'active' : ''}`}
            onClick={() => setActiveInst('all')}
          >
            🎓 Όλα τα Μαθήματα
          </button>
          {institutions.map(inst => (
            <button
              key={inst.id}
              className={`enroll-inst-btn ${activeInst === inst.id ? 'active' : ''}`}
              onClick={() => setActiveInst(inst.id)}
              title={inst.name}
            >
              🏛 {inst.name.replace(/\s*-\s*Πανεπιστήμιο Πατρών/i, '')}
            </button>
          ))}
        </aside>

        {/* Courses list */}
        <div className="enroll-picker-main">
          <input
            className="enroll-search"
            type="text"
            placeholder="Αναζήτηση μαθήματος..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {loading ? (
            <div className="enroll-loading"><div className="enroll-spinner" /></div>
          ) : filtered.length === 0 ? (
            <p className="enroll-no-results">Δεν βρέθηκαν μαθήματα.</p>
          ) : (
            <div className="enroll-picker-grid">
              {filtered.map(c => {
                const diff = DIFFICULTY_LABELS[c.difficulty] || { label: c.difficulty, color: '' };
                const isFree = !c.price || c.price === '0.00';
                return (
                  <div
                    key={c.id}
                    className="enroll-picker-card"
                    onClick={() => router.push(`/enroll?course=${c.id}`)}
                  >
                    <div className="enroll-picker-card-top">
                      <span className={`enroll-diff ${diff.color}`}>{diff.label}</span>
                      <span className={isFree ? 'enroll-free' : 'enroll-price-tag'}>
                        {isFree ? 'Δωρεάν' : `${c.price}€`}
                      </span>
                    </div>
                    <h3>{c.title}</h3>
                    <p>{c.short_description}</p>
                    <div className="enroll-picker-meta">
                      <span>👤 {c.lecturer_name}</span>
                      <span>👥 {c.enrolled_count || 0}</span>
                    </div>
                    <div className="enroll-picker-cta">Εγγραφή →</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EnrollPage() {
  return (
    <Suspense fallback={<div className="enroll-loading"><div className="enroll-spinner" /></div>}>
      <EnrollContent />
    </Suspense>
  );
}