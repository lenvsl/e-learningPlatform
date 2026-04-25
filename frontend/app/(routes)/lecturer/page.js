'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import './lecturer.css';

const DIFFICULTY_OPTIONS = [
  { value: 'beginner',     label: 'Αρχάριος' },
  { value: 'intermediate', label: 'Μέσος' },
  { value: 'advanced',     label: 'Προχωρημένος' },
];

const STATUS_LABELS = {
  draft:     { label: 'Draft',      color: 'status-draft' },
  published: { label: 'Published',  color: 'status-published' },
  archived:  { label: 'Archived',   color: 'status-archived' },
};

export default function LecturerPage() {
  const router = useRouter();
  const [user, setUser]       = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  // New course form
  const [form, setForm] = useState({
    title: '', slug: '', short_description: '', description: '',
    price: '0', difficulty: 'beginner', category_id: '', institution_id: '',
    duration_minutes: '', max_students: '',
  });
  const [categories, setCategories]     = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [creating, setCreating]   = useState(false);
  const [createError, setCreateError] = useState(null);

  // Pending text gradings
  const [pendingGradings, setPendingGradings] = useState([]);
  const [showGrading, setShowGrading]         = useState(false);
  const [gradingAttempt, setGradingAttempt]   = useState(null); // { attempt, text_questions }
  const [textGrades, setTextGrades]           = useState({});   // { question_id: 0|1 }
  const [submittingGrade, setSubmittingGrade] = useState(false);

  // Refetch when user navigates back to this page
  useEffect(() => {
    const onFocus = () => loadCourses();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    try {
      const payload = JSON.parse(decodeURIComponent(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')));
      if (payload.role !== 'lecturer' && payload.role !== 'admin') {
        router.push('/dashboard'); return;
      }
      setUser(payload);
    } catch { router.push('/login'); return; }

    loadCourses(token);
  }, []);

  const loadCourses = (tok) => {
    const hdrs = { 'Authorization': `Bearer ${tok || sessionStorage.getItem('token')}` };
    Promise.all([
      fetch('http://localhost:5000/api/lecturer/courses', { headers: hdrs }).then(r => r.json()),
      fetch('http://localhost:5000/api/categories').then(r => r.json()).catch(() => []),
      fetch('http://localhost:5000/api/institutions').then(r => r.json()).catch(() => []),
      fetch('http://localhost:5000/api/lecturer/pending-gradings', { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]).then(([c, cats, insts, gradings]) => {
      setCourses(Array.isArray(c) ? c : []);
      setCategories(Array.isArray(cats) ? cats : []);
      setInstitutions(Array.isArray(insts) ? insts : []);
      setPendingGradings(Array.isArray(gradings) ? gradings : []);
      setLoading(false);
      checkDriveStatus(tok || sessionStorage.getItem('token'));
    }).catch(() => setLoading(false));
  };

  const GR = {'α':'a','β':'b','γ':'g','δ':'d','ε':'e','ζ':'z','η':'i','θ':'th','ι':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y','φ':'f','χ':'ch','ψ':'ps','ω':'o','ά':'a','έ':'e','ή':'i','ί':'i','ό':'o','ύ':'y','ώ':'o'};
  const toSlug = (val) => val.toLowerCase().split('').map(c => GR[c]??c).join('')
    .replace(/\s+/g,'-').replace(/[^\w-]/g,'').replace(/--+/g,'-').replace(/^-|-$/g,'');
  const handleTitleChange = (val) => {
    setForm(f => ({ ...f, title: val, slug: toSlug(val) }));
  };

  const handleDelete = async (e, courseId, courseTitle) => {
    e.preventDefault(); // prevent Link navigation
    e.stopPropagation();
    if (!confirm(`Διαγραφή "${courseTitle}"; Αυτή η ενέργεια δεν αναιρείται.`)) return;
    const tok = sessionStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:5000/api/courses/${courseId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tok}` }
      });
      if (res.ok) loadCourses();
    } catch { alert('Σφάλμα διαγραφής'); }
  };

  const handleCreate = async () => {
    if (!form.title || !form.slug) { setCreateError('Τίτλος και slug είναι υποχρεωτικά'); return; }
    const token = sessionStorage.getItem('token');
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('http://localhost:5000/api/courses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          price: parseFloat(form.price) || 0,
          category_id: form.category_id || null,
          institution_id: form.institution_id || null,
          duration_minutes: parseInt(form.duration_minutes) || null,
          max_students: parseInt(form.max_students) || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowNew(false);
        setForm({ title: '', slug: '', short_description: '', description: '',
          price: '0', difficulty: 'beginner', category_id: '', institution_id: '',
          duration_minutes: '', max_students: '' });
        loadCourses();
        router.push(`/lecturer/courses/${data.id}`);
      } else if (data.error?.includes('slug')) {
        // Duplicate slug — προσθέτουμε αριθμό αυτόματα
        const newSlug = `${form.slug}-2`;
        setForm(f => ({ ...f, slug: newSlug }));
        setCreateError('Υπάρχει ήδη μάθημα με αυτό το slug. Το slug ενημερώθηκε — δοκίμασε ξανά.');
      } else {
        setCreateError(data.error || 'Σφάλμα δημιουργίας');
      }
    } catch { setCreateError('Σφάλμα σύνδεσης'); }
    finally { setCreating(false); }
  };

  const openGrading = async (attemptId) => {
    const tok = sessionStorage.getItem('token');
    const res = await fetch(`http://localhost:5000/api/quiz-attempts/${attemptId}`, {
      headers: { 'Authorization': `Bearer ${tok}` }
    });
    const data = await res.json();
    setGradingAttempt(data);
    setTextGrades({});
    setShowGrading(true);
  };

  const submitGrade = async () => {
    setSubmittingGrade(true);
    const tok = sessionStorage.getItem('token');
    try {
      await fetch(`http://localhost:5000/api/quiz-attempts/${gradingAttempt.attempt.id}/grade`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text_grades: textGrades })
      });
      setShowGrading(false);
      setGradingAttempt(null);
      loadCourses(tok);
    } finally { setSubmittingGrade(false); }
  };

  if (loading) return (
    <div className="lec-loading"><div className="lec-spinner" /><p>Φόρτωση...</p></div>
  );

  return (
    <div className="lec-page">

      {/* Header */}
      <div className="lec-header">
        <div>
          <h1>Τα Μαθήματά μου</h1>
          <p>Καλωσήρθες, <strong>{user?.first_name} {user?.last_name}</strong></p>
        </div>
        <button className="lec-btn-primary" onClick={() => setShowNew(true)}>
          ＋ Νέο Μάθημα
        </button>
      </div>

      {/* Pending gradings notification */}
      {pendingGradings.length > 0 && (
        <div className="lec-pending-banner">
          <span>✍️ Εκκρεμείς βαθμολογήσεις ελεύθερου κειμένου: <strong>{pendingGradings.length}</strong></span>
          <div className="lec-pending-list">
            {pendingGradings.map(g => (
              <div key={g.attempt_id} className="lec-pending-item">
                <div>
                  <strong>{g.student_name}</strong> — {g.quiz_title}
                  <span className="lec-pending-course"> ({g.course_title})</span>
                </div>
                <button className="lec-btn-primary lec-btn-sm" onClick={() => openGrading(g.attempt_id)}>
                  Βαθμολόγηση
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Course list */}
      {courses.length === 0 ? (
        <div className="lec-empty">
          <span>📭</span>
          <p>Δεν έχεις δημιουργήσει μαθήματα ακόμα.</p>
          <button className="lec-btn-primary" onClick={() => setShowNew(true)}>Δημιούργησε το πρώτο σου</button>
        </div>
      ) : (
        <div className="lec-courses-grid">
          {courses.map(c => {
            const st = STATUS_LABELS[c.status] || { label: c.status, color: '' };
            return (
              <Link key={c.id} href={`/lecturer/courses/${c.id}`} className="lec-course-card">
                <div className="lec-card-top">
                  <span className={`lec-status ${st.color}`}>{st.label}</span>
                  <span className="lec-card-meta">👥 {c.enrolled_count}</span>
                </div>
                <h3>{c.title}</h3>
                <div className="lec-card-footer">
                  <span>📂 {c.section_count} ενότητες</span>
                  <span>{!c.price || c.price === '0.00' ? 'Δωρεάν' : `${c.price}€`}</span>
                </div>
                <div className="lec-card-arrow">→</div>
                <button
                  className="lec-card-delete"
                  onClick={(e) => handleDelete(e, c.id, c.title)}
                  title="Διαγραφή μαθήματος"
                ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
              </Link>
            );
          })}
        </div>
      )}

      {/* New course modal */}
      {showNew && (
        <div className="lec-modal-overlay" onClick={() => setShowNew(false)}>
          <div className="lec-modal" onClick={e => e.stopPropagation()}>
            <div className="lec-modal-header">
              <h2>Νέο Μάθημα</h2>
              <button className="lec-modal-close" onClick={() => setShowNew(false)}>✕</button>
            </div>

            <div className="lec-modal-body">
              <div className="lec-field">
                <label>Τίτλος *</label>
                <input type="text" placeholder="π.χ. Python για Αρχάριους"
                  value={form.title} onChange={e => handleTitleChange(e.target.value)} />
              </div>

              <div className="lec-field">
                <label>Slug <span style={{fontWeight:'normal',color:'#888',fontSize:'12px'}}>(αυτόματο από τίτλο)</span></label>
                <input type="text" value={form.slug} readOnly
                  style={{background:'#1e1e2e',color:'#888',cursor:'not-allowed'}} />
              </div>

              <div className="lec-field">
                <label>Σύντομη περιγραφή</label>
                <input type="text" placeholder="Μια πρόταση για το μάθημα"
                  value={form.short_description}
                  onChange={e => setForm(f => ({ ...f, short_description: e.target.value }))} />
              </div>

              <div className="lec-field">
                <label>Πλήρης περιγραφή</label>
                <textarea placeholder="Αναλυτική περιγραφή..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div className="lec-field-row">
                <div className="lec-field">
                  <label>Τιμή (€)</label>
                  <input type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                </div>
                <div className="lec-field">
                  <label>Δυσκολία</label>
                  <select value={form.difficulty}
                    onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}>
                    {DIFFICULTY_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="lec-field-row">
                <div className="lec-field">
                  <label>Κατηγορία</label>
                  <select value={form.category_id}
                    onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                    <option value="">— Επιλέξτε —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="lec-field">
                  <label>Τμήμα</label>
                  <select value={form.institution_id}
                    onChange={e => setForm(f => ({ ...f, institution_id: e.target.value }))}>
                    <option value="">— Επιλέξτε —</option>
                    {institutions.map(i => <option key={i.id} value={i.id}>{i.name.replace(/\s*-\s*Πανεπιστήμιο Πατρών/i, '')}</option>)}
                  </select>
                </div>
              </div>

              <div className="lec-field-row">
                <div className="lec-field">
                  <label>Διάρκεια (λεπτά)</label>
                  <input type="number" min="0" placeholder="120"
                    value={form.duration_minutes}
                    onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} />
                </div>
                <div className="lec-field">
                  <label>Μέγ. φοιτητές</label>
                  <input type="number" min="0" placeholder="50"
                    value={form.max_students}
                    onChange={e => setForm(f => ({ ...f, max_students: e.target.value }))} />
                </div>
              </div>

              {createError && <p className="lec-error">{createError}</p>}
            </div>

            <div className="lec-modal-footer">
              <button className="lec-btn-ghost" onClick={() => setShowNew(false)}>Ακύρωση</button>
              <button className="lec-btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? 'Δημιουργία...' : 'Δημιουργία Μαθήματος'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grading Modal */}
      {showGrading && gradingAttempt && (
        <div className="lec-modal-overlay" onClick={() => setShowGrading(false)}>
          <div className="lec-modal" onClick={e => e.stopPropagation()}>
            <div className="lec-modal-header">
              <h2>✍️ Βαθμολόγηση — {gradingAttempt.attempt.student_name}</h2>
              <button className="lec-modal-close" onClick={() => setShowGrading(false)}>✕</button>
            </div>
            <div className="lec-modal-body">
              <p style={{marginBottom:'12px', color:'#94a3b8'}}>
                Αυτόματος βαθμός (multiple/single choice): <strong>{gradingAttempt.attempt.score}%</strong>
              </p>
              {gradingAttempt.text_questions.map((q, i) => {
                const studentAnswer = gradingAttempt.attempt.answers?.[q.id] || '—';
                return (
                  <div key={q.id} className="lec-field" style={{marginBottom:'16px'}}>
                    <label>Ερώτηση {i + 1}: {q.question_text}</label>
                    <div style={{background:'#1e293b', padding:'8px 12px', borderRadius:'6px', margin:'6px 0', color:'#e2e8f0'}}>
                      {studentAnswer}
                    </div>
                    <div style={{display:'flex', gap:'8px', marginTop:'6px'}}>
                      <label style={{display:'flex', alignItems:'center', gap:'4px', cursor:'pointer'}}>
                        <input type="radio" name={`q-${q.id}`}
                          checked={textGrades[q.id] === 1}
                          onChange={() => setTextGrades(g => ({ ...g, [q.id]: 1 }))} />
                        ✅ Σωστό
                      </label>
                      <label style={{display:'flex', alignItems:'center', gap:'4px', cursor:'pointer'}}>
                        <input type="radio" name={`q-${q.id}`}
                          checked={textGrades[q.id] === 0}
                          onChange={() => setTextGrades(g => ({ ...g, [q.id]: 0 }))} />
                        ❌ Λάθος
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="lec-modal-footer">
              <button className="lec-btn-ghost" onClick={() => setShowGrading(false)}>Ακύρωση</button>
              <button className="lec-btn-primary" onClick={submitGrade} disabled={submittingGrade}>
                {submittingGrade ? 'Αποθήκευση...' : 'Οριστικοποίηση Βαθμού'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}