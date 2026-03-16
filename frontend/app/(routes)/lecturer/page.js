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
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role !== 'lecturer' && payload.role !== 'admin') {
        router.push('/dashboard'); return;
      }
      setUser(payload);
    } catch { router.push('/login'); return; }

    const headers = { 'Authorization': `Bearer ${token}` };

    loadCourses(token);
  }, []);

  const loadCourses = (tok) => {
    const hdrs = { 'Authorization': `Bearer ${tok || sessionStorage.getItem('token')}` };
    Promise.all([
      fetch('http://localhost:5000/api/lecturer/courses', { headers: hdrs }).then(r => r.json()),
      fetch('http://localhost:5000/api/categories').then(r => r.json()).catch(() => []),
      fetch('http://localhost:5000/api/institutions').then(r => r.json()).catch(() => []),
    ]).then(([c, cats, insts]) => {
      setCourses(Array.isArray(c) ? c : []);
      setCategories(Array.isArray(cats) ? cats : []);
      setInstitutions(Array.isArray(insts) ? insts : []);
      setLoading(false);
      checkDriveStatus(tok || sessionStorage.getItem('token'));
    }).catch(() => setLoading(false));
  };

  // Auto-generate slug from title
  const handleTitleChange = (val) => {
    const slug = val.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '')
      .replace(/--+/g, '-');
    setForm(f => ({ ...f, title: val, slug }));
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
      } else {
        setCreateError(data.error || 'Σφάλμα δημιουργίας');
      }
    } catch { setCreateError('Σφάλμα σύνδεσης'); }
    finally { setCreating(false); }
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
                <label>Slug *</label>
                <input type="text" placeholder="python-gia-arxarious"
                  value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} />
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
    </div>
  );
}