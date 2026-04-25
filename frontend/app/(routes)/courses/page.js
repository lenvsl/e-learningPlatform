'use client';

import { useState, useEffect } from 'react';
import './courses.css';

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

const shortName = (name) =>
  name.replace(/\s*-\s*Πανεπιστήμιο Πατρών/i, '').trim();

export default function CoursesPage() {
  const [institutions, setInstitutions] = useState([]);
  const [activeInst, setActiveInst]     = useState('all');
  const [courses, setCourses]           = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [loadingInst, setLoadingInst]   = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [error, setError]               = useState(null);
  const [search, setSearch]             = useState('');
  const [searchInput, setSearchInput]   = useState('');

  useEffect(() => {
    fetch('http://localhost:5000/api/institutions')
      .then(r => r.json())
      .then(data => { setInstitutions(data); setLoadingInst(false); })
      .catch(() => { setError('Σφάλμα φόρτωσης τμημάτων.'); setLoadingInst(false); });
  }, []);

  useEffect(() => {
    setLoadingCourses(true);
    const params = new URLSearchParams();
    if (activeInst !== 'all') params.set('institution_id', activeInst);
    if (search) params.set('search', search);
    const url = `http://localhost:5000/api/courses${params.toString() ? '?' + params : ''}`;

    fetch(url)
      .then(r => r.json())
      .then(data => { setCourses(data); setLoadingCourses(false); })
      .catch(() => { setError('Σφάλμα φόρτωσης μαθημάτων.'); setLoadingCourses(false); });
  }, [activeInst, search]);

  const activeInstData = institutions.find(i => i.id === activeInst);

  if (error) return <div className="courses-error"><p>{error}</p></div>;

  return (
    <div className="courses-page">

      {/* Page Header */}
      <div className="courses-header">
        <h1>Εξερευνήστε τα Μαθήματα</h1>
        <p>Πανεπιστήμιο Πατρών - Επιλέξτε τμήμα για να δείτε τα διαθέσιμα μαθήματα</p>
        <form className="courses-search-form" onSubmit={e => { e.preventDefault(); setSearch(searchInput); }}>
          <input
            className="courses-search-input"
            type="text"
            placeholder="Αναζήτηση μαθήματος..."
            value={searchInput}
            onChange={e => { setSearchInput(e.target.value); if (e.target.value === '') setSearch(''); }}
          />
          <button className="courses-search-btn" type="submit">🔍</button>
        </form>
      </div>

      <div className="courses-layout">

        {/* Sidebar */}
        <aside className="courses-sidebar">
          <p className="sidebar-label">Τμήματα</p>

          <button
            className={`sidebar-item ${activeInst === 'all' ? 'active' : ''}`}
            onClick={() => setActiveInst('all')}
          >
            <span className="sidebar-icon">🎓</span>
            <span className="sidebar-name">Όλα τα Μαθήματα</span>
          </button>

          {loadingInst ? (
            <p className="sidebar-loading">Φόρτωση...</p>
          ) : (
            institutions.map(inst => (
              <button
                key={inst.id}
                className={`sidebar-item ${activeInst === inst.id ? 'active' : ''}`}
                onClick={() => setActiveInst(inst.id)}
                title={inst.name}
              >
                <span className="sidebar-icon">🏛</span>
                <span className="sidebar-name">{shortName(inst.name)}</span>
              </button>
            ))
          )}
        </aside>

        {/* Main content */}
        <main className="courses-main">

          {/* Dept info banner */}
          {activeInst !== 'all' && activeInstData && (
            <div className="dept-banner">
              <div className="dept-banner-text">
                <h2>{activeInstData.name}</h2>
                <p>{activeInstData.description}</p>
              </div>
              {activeInstData.website_url && (
                <a href={activeInstData.website_url} target="_blank" rel="noreferrer" className="dept-link">
                  Ιστοσελίδα →
                </a>
              )}
            </div>
          )}

          {/* Courses */}
          {loadingCourses ? (
            <div className="courses-loading"><div className="spinner" /><p>Φόρτωση...</p></div>
          ) : courses.length === 0 ? (
            <div className="courses-empty"><p>Δεν βρέθηκαν δημοσιευμένα μαθήματα.</p></div>
          ) : (
            <>
              <p className="courses-count">{courses.length} μαθήματα</p>
              <div className="courses-grid">
                {courses.map(course => {
                  const diff = DIFFICULTY_LABELS[course.difficulty] || { label: course.difficulty, color: '' };
                  return (
                    <div key={course.id} className="course-card" onClick={() => setSelectedCourse(course)}>
                      <div className="course-card-top">
                        <span className="course-category-badge">{course.category_name || '—'}</span>
                        <span className={`course-difficulty ${diff.color}`}>{diff.label}</span>
                      </div>
                      <h3 className="course-title">{course.title}</h3>
                      <p className="course-desc">{course.short_description}</p>
                      <div className="course-meta">
                        <span>⏱ {formatDuration(course.duration_minutes)}</span>
                        <span>👥 {course.enrolled_count || 0} εγγεγραμμένοι</span>
                      </div>
                      <div className="course-footer">
                        <span className="course-lecturer">👤 {course.lecturer_name || '—'}</span>
                        <span className="course-cta">Λεπτομέρειες →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Modal */}
      {selectedCourse && (
        <div className="modal-overlay" onClick={() => setSelectedCourse(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedCourse(null)}>✕</button>

            <div className="modal-header">
              <span className="modal-category">{selectedCourse.category_name || '—'}</span>
              <span className={`course-difficulty ${DIFFICULTY_LABELS[selectedCourse.difficulty]?.color}`}>
                {DIFFICULTY_LABELS[selectedCourse.difficulty]?.label}
              </span>
            </div>

            <h2 className="modal-title">{selectedCourse.title}</h2>

            <div className="modal-info-grid">
              {[
                { label: 'Διάρκεια',          value: `⏱ ${formatDuration(selectedCourse.duration_minutes)}` },
                { label: 'Εγγεγραμμένοι',     value: `👥 ${selectedCourse.enrolled_count || 0}` },
                { label: 'Καθηγητής',          value: `👤 ${selectedCourse.lecturer_name || '—'}` },
                { label: 'Τμήμα',             value: `🏛 ${selectedCourse.institution_name || '—'}` },
                { label: 'Μέγιστοι φοιτητές', value: `🎓 ${selectedCourse.max_students || '—'}` },
                { label: 'Τιμή',              value: (!selectedCourse.price || selectedCourse.price === '0.00') ? '🆓 Δωρεάν' : `💰 ${selectedCourse.price} ${selectedCourse.currency}` },
              ].map(({ label, value }) => (
                <div key={label} className="modal-info-item">
                  <span className="info-label">{label}</span>
                  <span className="info-value">{value}</span>
                </div>
              ))}
            </div>

            {selectedCourse.learning_objectives?.length > 0 && (
              <div className="modal-section">
                <h4>Τι θα μάθεις</h4>
                <ul className="modal-list">
                  {selectedCourse.learning_objectives.map((obj, i) => <li key={i}>✓ {obj}</li>)}
                </ul>
              </div>
            )}

            {selectedCourse.prerequisites?.length > 0 && (
              <div className="modal-section">
                <h4>Προαπαιτούμενα</h4>
                <ul className="modal-list prerequisites">
                  {selectedCourse.prerequisites.map((pre, i) => <li key={i}>→ {pre}</li>)}
                </ul>
              </div>
            )}

            <div className="modal-actions">
              {selectedCourse.description && (
                <p className="modal-full-desc">{selectedCourse.description}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}