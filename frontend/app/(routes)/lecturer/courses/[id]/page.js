'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import '../../lecturer.css';

export default function LecturerCoursePage() {
  const { id: courseId } = useParams();
  const [course, setCourse]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  // ── Edit course ──
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editError, setEditError] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [categories, setCategories]     = useState([]);

  // Section / Lesson modals
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionFree, setNewSectionFree]   = useState(false);
  const [addingSec, setAddingSec] = useState(false);

  const [showAddLesson, setShowAddLesson] = useState(null); // section_id
  const [newLesson, setNewLesson] = useState({ title: '', lesson_type: 'video', is_free: false });
  const [addingLesson, setAddingLesson] = useState(false);

  // Upload state per lesson
  const [uploading, setUploading]     = useState({});
  const [uploadMsg, setUploadMsg]     = useState({});
  const fileRefs = useRef({});

  // PDF upload state
  const [uploadingPdf, setUploadingPdf] = useState({});
  const [pdfMsg, setPdfMsg]             = useState({});
  const pdfRefs = useRef({});

  // ── Quiz state ──
  const [quiz, setQuiz]             = useState(null);  // existing quiz
  const [showQuizPanel, setShowQuizPanel] = useState(false);
  const [quizForm, setQuizForm]     = useState({ title: 'Τελικό Quiz', passing_score: 70 });
  const [questions, setQuestions]   = useState([
    { question_text: '', question_type: 'single_choice', options: ['', '', '', ''], correct_answer: '' }
  ]);
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [quizError, setQuizError]   = useState(null);
  const [quizSuccess, setQuizSuccess] = useState(false);

  const token = () => sessionStorage.getItem('token');
  const headers = () => ({ 'Authorization': `Bearer ${token()}` });

  useEffect(() => {
    loadCourse();
    loadMeta();
  }, [courseId]);

  const loadMeta = () => {
    Promise.all([
      fetch('http://localhost:5000/api/institutions').then(r => r.json()).catch(() => []),
      fetch('http://localhost:5000/api/categories').then(r => r.json()).catch(() => []),
    ]).then(([insts, cats]) => {
      setInstitutions(Array.isArray(insts) ? insts : []);
      setCategories(Array.isArray(cats) ? cats : []);
    });
  };

  const loadCourse = () => {
    fetch(`http://localhost:5000/api/courses/${courseId}`)
      .then(r => r.json())
      .then(data => {
        setCourse(data);
        // Check if course already has a quiz
        fetch(`http://localhost:5000/api/courses/${courseId}/quiz`, {
          headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
        }).then(r => r.ok ? r.json() : null)
          .then(data => { if (data?.quiz) setQuiz(data.quiz); })
          .catch(() => {});
        setEditForm({
          title: data.title || '',
          short_description: data.short_description || '',
          description: data.description || '',
          price: data.price || '0',
          difficulty: data.difficulty || 'beginner',
          category_id: data.category_id || '',
          institution_id: data.institution_id || '',
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  // ── Save edited course ──
  const handleSaveEdit = async () => {
    setEditError(null);
    setSaving(true);
    try {
      const res = await fetch(`http://localhost:5000/api/courses/${courseId}`, {
        method: 'PUT',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...course,
          ...editForm,
          price: parseFloat(editForm.price) || 0,
          category_id: editForm.category_id || null,
          institution_id: editForm.institution_id || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCourse(c => ({ ...c, ...editForm }));
        setEditing(false);
      } else {
        setEditError(data.error || 'Σφάλμα αποθήκευσης');
      }
    } catch { setEditError('Σφάλμα σύνδεσης'); }
    finally { setSaving(false); }
  };

  // ── Publish / Unpublish ──
  const toggleStatus = async () => {
    const newStatus = course.status === 'published' ? 'draft' : 'published';
    setSaving(true);
    try {
      const res = await fetch(`http://localhost:5000/api/courses/${courseId}`, {
        method: 'PUT',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...course, status: newStatus }),
      });
      if (res.ok) setCourse(c => ({ ...c, status: newStatus }));
    } finally { setSaving(false); }
  };

  // ── Add Section ──
  const handleAddSection = async () => {
    if (!newSectionTitle) return;
    setAddingSec(true);
    try {
      const res = await fetch(`http://localhost:5000/api/courses/${courseId}/sections`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newSectionTitle, is_free: newSectionFree }),
      });
      if (res.ok) {
        setShowAddSection(false);
        setNewSectionTitle('');
        setNewSectionFree(false);
        loadCourse();
      }
    } finally { setAddingSec(false); }
  };

  // ── Delete Section ──
  const handleDeleteSection = async (sectionId) => {
    if (!confirm('Διαγραφή ενότητας; Θα διαγραφούν και τα lessons της.')) return;
    await fetch(`http://localhost:5000/api/sections/${sectionId}`, {
      method: 'DELETE', headers: headers()
    });
    loadCourse();
  };

  // ── Add Lesson ──
  const handleAddLesson = async () => {
    if (!newLesson.title) return;
    setAddingLesson(true);
    try {
      const res = await fetch(`http://localhost:5000/api/sections/${showAddLesson}/lessons`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(newLesson),
      });
      if (res.ok) {
        setShowAddLesson(null);
        setNewLesson({ title: '', lesson_type: 'video', is_free: false });
        loadCourse();
      }
    } finally { setAddingLesson(false); }
  };

  // ── Upload PDF ──
  const handleUploadPdf = async (lessonId, file) => {
    if (!file) return;
    setUploadingPdf(u => ({ ...u, [lessonId]: true }));
    setPdfMsg(m => ({ ...m, [lessonId]: null }));
    const formData = new FormData();
    formData.append('pdf', file);
    try {
      const res = await fetch(`http://localhost:5000/api/lessons/${lessonId}/upload/pdf`, {
        method: 'POST',
        headers: headers(),
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setPdfMsg(m => ({ ...m, [lessonId]: 'success' }));
        loadCourse();
      } else {
        setPdfMsg(m => ({ ...m, [lessonId]: data.error || 'Σφάλμα' }));
      }
    } catch {
      setPdfMsg(m => ({ ...m, [lessonId]: 'Σφάλμα σύνδεσης' }));
    } finally {
      setUploadingPdf(u => ({ ...u, [lessonId]: false }));
    }
  };

  // ── Upload Video ──
  const handleUpload = async (lessonId, file) => {
    if (!file) return;
    setUploading(u => ({ ...u, [lessonId]: true }));
    setUploadMsg(m => ({ ...m, [lessonId]: null }));
    const formData = new FormData();
    formData.append('video', file);
    try {
      const res = await fetch(`http://localhost:5000/api/lessons/${lessonId}/upload-video`, {
        method: 'POST',
        headers: headers(),
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setUploadMsg(m => ({ ...m, [lessonId]: 'success' }));
        loadCourse();
      } else {
        setUploadMsg(m => ({ ...m, [lessonId]: data.error || 'Σφάλμα' }));
      }
    } catch {
      setUploadMsg(m => ({ ...m, [lessonId]: 'Σφάλμα σύνδεσης' }));
    } finally {
      setUploading(u => ({ ...u, [lessonId]: false }));
    }
  };

  // ── Delete Video ──
  const handleDeleteVideo = async (lessonId) => {
    if (!confirm('Διαγραφή βίντεο;')) return;
    const res = await fetch(`http://localhost:5000/api/lessons/${lessonId}/video`, {
      method: 'DELETE', headers: headers()
    });
    if (res.ok) { loadCourse(); }
  };

  // ── Save Quiz ──
  const handleSaveQuiz = async () => {
    setQuizError(null);
    setQuizSuccess(false);

    // Validation
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question_text.trim()) { setQuizError(`Ερώτηση ${i+1}: λείπει το κείμενο`); return; }
      if (q.question_type !== 'text') {
        if (q.options.some(o => !o.trim())) { setQuizError(`Ερώτηση ${i+1}: συμπλήρωσε όλες τις επιλογές`); return; }
        if (!q.correct_answer) { setQuizError(`Ερώτηση ${i+1}: επέλεξε σωστή απάντηση`); return; }
      }
    }

    setSavingQuiz(true);
    try {
      // Step 1: Need a lesson_id — use last lesson or create a quiz lesson
      const allLessons = (course.sections || []).flatMap(s => s.lessons || []);
      let lessonId = allLessons.length > 0 ? allLessons[allLessons.length - 1].id : null;

      if (!lessonId) {
        setQuizError('Πρόσθεσε τουλάχιστον μία ενότητα και ένα βίντεο πριν δημιουργήσεις quiz.');
        setSavingQuiz(false); return;
      }

      // Step 2: Create quiz
      const quizRes = await fetch(`http://localhost:5000/api/lessons/${lessonId}/quiz`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: quizForm.title, passing_score: quizForm.passing_score }),
      });
      if (!quizRes.ok) { const e = await quizRes.json(); setQuizError(e.error); setSavingQuiz(false); return; }
      const newQuiz = await quizRes.json();

      // Step 3: Add questions
      const qRes = await fetch(`http://localhost:5000/api/quizzes/${newQuiz.id}/questions`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: questions.map(q => ({
          question_text: q.question_text,
          question_type: q.question_type || 'single_choice',
          options: q.question_type === 'text' ? [] : q.options,
          correct_answer: q.question_type === 'text' ? '' : q.correct_answer,
        })) }),
      });
      if (!qRes.ok) { const e = await qRes.json(); setQuizError(e.error); setSavingQuiz(false); return; }

      setQuiz(newQuiz);
      setQuizSuccess(true);
      setShowQuizPanel(false);
    } catch { setQuizError('Σφάλμα σύνδεσης'); }
    finally { setSavingQuiz(false); }
  };

  const addQuestion = () => setQuestions(q => [...q, { question_text: '', question_type: 'single_choice', options: ['', '', '', ''], correct_answer: '' }]);
  const removeQuestion = (i) => setQuestions(q => q.filter((_, idx) => idx !== i));
  const updateQuestion = (i, field, val) => setQuestions(q => q.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  const updateOption = (qi, oi, val) => setQuestions(q => q.map((item, idx) => idx === qi ? { ...item, options: item.options.map((o, j) => j === oi ? val : o) } : item));

  if (loading) return (
    <div className="lec-loading"><div className="lec-spinner" /><p>Φόρτωση...</p></div>
  );
  if (!course) return (
    <div className="lec-loading"><p>Το μάθημα δεν βρέθηκε.</p></div>
  );

  const isFree = !course.price || course.price === '0.00';

  return (
    <div className="lec-course-page">

      {/* Top bar */}
      <div className="lec-course-topbar">
        <Link href="/lecturer" className="lec-back">← Πίσω</Link>
        <div className="lec-course-topbar-right">
          <span className={`lec-status ${course.status === 'published' ? 'status-published' : 'status-draft'}`}>
            {course.status === 'published' ? '🟢 Published' : '⚪ Draft'}
          </span>
          <button className="lec-btn-ghost" onClick={toggleStatus} disabled={saving}>
            {course.status === 'published' ? 'Μετάβαση σε Draft' : '🚀 Δημοσίευση'}
          </button>
          <Link href={`/courses/${courseId}`} className="lec-btn-ghost" target="_blank">
            👁 Προεπισκόπηση
          </Link>
        </div>
      </div>

      {/* Course info */}
      <div className="lec-course-header">
        {!editing ? (
          <>
            <div className="lec-course-title-row">
              <h1>{course.title}</h1>
              <div className="lec-course-pills">
                <span>{course.difficulty}</span>
                <span>{isFree ? 'Δωρεάν' : `${course.price}€`}</span>
                <span>👥 {course.enrolled_count} εγγεγραμμένοι</span>
              </div>
            </div>
            <p>{course.short_description}</p>
            <button className="lec-btn-edit" onClick={() => setEditing(true)}>✏️ Επεξεργασία</button>
          </>
        ) : (
          <div className="lec-edit-form">
            <div className="lec-field">
              <label>Τίτλος</label>
              <input type="text" value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="lec-field">
              <label>Σύντομη περιγραφή</label>
              <input type="text" value={editForm.short_description}
                onChange={e => setEditForm(f => ({ ...f, short_description: e.target.value }))} />
            </div>
            <div className="lec-field">
              <label>Πλήρης περιγραφή</label>
              <textarea value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="lec-field-row">
              <div className="lec-field">
                <label>Τιμή (€)</label>
                <input type="number" min="0" step="0.01" value={editForm.price}
                  onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} />
              </div>
              <div className="lec-field">
                <label>Δυσκολία</label>
                <select value={editForm.difficulty}
                  onChange={e => setEditForm(f => ({ ...f, difficulty: e.target.value }))}>
                  <option value="beginner">Αρχάριος</option>
                  <option value="intermediate">Μέσος</option>
                  <option value="advanced">Προχωρημένος</option>
                </select>
              </div>
            </div>
            <div className="lec-field-row">
              <div className="lec-field">
                <label>Κατηγορία</label>
                <select value={editForm.category_id}
                  onChange={e => setEditForm(f => ({ ...f, category_id: e.target.value }))}>
                  <option value="">— Επιλέξτε —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="lec-field">
                <label>Τμήμα</label>
                <select value={editForm.institution_id}
                  onChange={e => setEditForm(f => ({ ...f, institution_id: e.target.value }))}>
                  <option value="">— Επιλέξτε —</option>
                  {institutions.map(i => <option key={i.id} value={i.id}>{i.name.replace(/\s*-\s*Πανεπιστήμιο Πατρών/i, '')}</option>)}
                </select>
              </div>
            </div>
            {editError && <p className="lec-error">{editError}</p>}
            <div className="lec-edit-actions">
              <button className="lec-btn-ghost" onClick={() => { setEditing(false); setEditError(null); }}>Ακύρωση</button>
              <button className="lec-btn-primary" onClick={handleSaveEdit} disabled={saving}>
                {saving ? 'Αποθήκευση...' : '💾 Αποθήκευση'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="lec-sections">
        <div className="lec-sections-header">
          <h2>Ενότητες & Μαθήματα</h2>
          <button className="lec-btn-primary" onClick={() => setShowAddSection(true)}>
            ＋ Ενότητα
          </button>
        </div>

        {(!course.sections || course.sections.length === 0) ? (
          <div className="lec-empty-sections">
            <p>Δεν υπάρχουν ενότητες ακόμα.</p>
          </div>
        ) : (
          course.sections.map(section => (
            <div key={section.id} className="lec-section-block">
              <div className="lec-section-header">
                <div className="lec-section-title-row">
                  <span className="lec-section-icon">Τίτλος ενότητας:</span>
                  <h3>{section.title}</h3>
                  {section.is_free && <span className="lec-free-tag">Δωρεάν</span>}
                </div>
                <div className="lec-section-actions">
                  <button className="lec-btn-sm" onClick={() => setShowAddLesson(section.id)}>
                    ＋ Lesson / Μάθημα
                  </button>
                  <button className="lec-btn-sm lec-btn-danger"
                    onClick={() => handleDeleteSection(section.id)}>
                    🗑
                  </button>
                </div>
              </div>

              {/* Lessons */}
              <div className="lec-lessons-list">
                {(!section.lessons || section.lessons.length === 0) ? (
                  <p className="lec-no-lessons">Δεν υπάρχουν lessons. Πρόσθεσε ένα!</p>
                ) : (
                  section.lessons.map(lesson => (
                    <div key={lesson.id} className="lec-lesson-row">
                      <div className="lec-lesson-info">
                        <span className="lec-lesson-type-icon">
                          {lesson.lesson_type === 'video' ? '▶' : '📄'}
                        </span>
                        <div>
                          <p className="lec-lesson-title">{lesson.title}</p>
                          <p className="lec-lesson-meta">
                            {lesson.is_free && <span className="lec-free-tag">Δωρεάν</span>}
                            {lesson.video_path
                              ? <span className="lec-has-video">✅ Βίντεο uploaded</span>
                              : lesson.lesson_type === 'video'
                                ? <span className="lec-no-video">⚠️ Δεν έχει βίντεο</span>
                                : null
                            }
                          </p>
                        </div>
                      </div>

                      {/* Video actions */}
                      {lesson.lesson_type === 'video' && (
                        <div className="lec-video-actions">
                          {lesson.video_path ? (
                            <>
                              <a href={lesson.video_path} target="_blank"
                                className="lec-btn-sm">👁 Προβολή</a>
                              <button className="lec-btn-sm lec-btn-danger"
                                onClick={() => handleDeleteVideo(lesson.id)}>
                                🗑 Διαγραφή
                              </button>
                            </>
                          ) : (
                            <>
                              <input
                                type="file"
                                accept="video/*"
                                ref={el => fileRefs.current[lesson.id] = el}
                                style={{ display: 'none' }}
                                onChange={e => handleUpload(lesson.id, e.target.files[0])}
                              />
                              <button
                                className="lec-btn-sm lec-btn-upload"
                                onClick={() => fileRefs.current[lesson.id]?.click()}
                                disabled={uploading[lesson.id]}
                              >
                                {uploading[lesson.id]
                                  ? <><span className="lec-spin" /> Ανέβασμα...</>
                                  : '⬆ Upload Βίντεο'}
                              </button>
                            </>
                          )}
                          {uploadMsg[lesson.id] && uploadMsg[lesson.id] !== 'success' && (
                            <span className="lec-upload-error">{uploadMsg[lesson.id]}</span>
                          )}
                        </div>
                      )}

                      {/* PDF actions */}
                      {lesson.lesson_type === 'pdf' && (
                        <div className="lec-video-actions">
                          {lesson.pdf_path ? (
                            <a href={lesson.pdf_path} target="_blank" rel="noreferrer"
                              className="lec-btn-sm">📄 Προβολή PDF</a>
                          ) : (
                            <>
                              <input
                                type="file"
                                accept="application/pdf"
                                ref={el => pdfRefs.current[lesson.id] = el}
                                style={{ display: 'none' }}
                                onChange={e => handleUploadPdf(lesson.id, e.target.files[0])}
                              />
                              <button
                                className="lec-btn-sm lec-btn-upload"
                                onClick={() => pdfRefs.current[lesson.id]?.click()}
                                disabled={uploadingPdf[lesson.id]}
                              >
                                {uploadingPdf[lesson.id]
                                  ? <><span className="lec-spin" /> Ανέβασμα...</>
                                  : '⬆ Upload PDF'}
                              </button>
                            </>
                          )}
                          {pdfMsg[lesson.id] && pdfMsg[lesson.id] !== 'success' && (
                            <span className="lec-upload-error">{pdfMsg[lesson.id]}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Ειδοποιήσεις ── */}
      <NotifSection courseId={courseId} headers={headers} />

      {/* ── Τελικό Quiz ── */}
      <div className="lec-quiz-section">
        <div className="lec-sections-header">
          <div>
            <h2>🎯 Τελικό Quiz</h2>
            <p className="lec-quiz-subtitle">Οι εκπαιδευόμενοι το λύνουν για να πάρουν πιστοποιητικό</p>
          </div>
          {!quiz && !showQuizPanel && (
            <button className="lec-btn-primary" onClick={() => setShowQuizPanel(true)}>
              ＋ Δημιουργία Quiz
            </button>
          )}
        </div>

        {quiz ? (
          <div className="lec-quiz-exists">
            <div>
              <span>✅ Το quiz υπάρχει ήδη - <strong>{quiz.title}</strong></span>
              <span className="lec-quiz-pass">Βάση επιτυχίας: {quiz.passing_grade}%</span>
            </div>
            <button className="lec-btn-danger" onClick={async () => {
              if (!confirm('Διαγραφή quiz; Θα χαθούν όλες οι ερωτήσεις.')) return;
              await fetch(`http://localhost:5000/api/quizzes/${quiz.id}`, {
                method: 'DELETE', headers: headers()
              });
              setQuiz(null);
            }}>🗑 Διαγραφή Quiz</button>
          </div>
        ) : showQuizPanel ? (
          <div className="lec-quiz-panel">
            {/* Quiz settings */}
            <div className="lec-field-row">
              <div className="lec-field">
                <label>Τίτλος Quiz</label>
                <input type="text" value={quizForm.title}
                  onChange={e => setQuizForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="lec-field">
                <label>Βάση επιτυχίας (%)</label>
                <select value={quizForm.passing_score}
                  onChange={e => setQuizForm(f => ({ ...f, passing_score: parseInt(e.target.value) }))}>
                  <option value={50}>50%</option>
                  <option value={60}>60%</option>
                  <option value={70}>70%</option>
                  <option value={80}>80%</option>
                  <option value={90}>90%</option>
                </select>
              </div>
            </div>

            {/* Questions */}
            {questions.map((q, qi) => (
              <div key={qi} className="lec-question-block">
                <div className="lec-question-header">
                  <span>Ερώτηση {qi + 1}</span>
                  {questions.length > 1 && (
                    <button className="lec-btn-sm lec-btn-danger" onClick={() => removeQuestion(qi)}>🗑</button>
                  )}
                </div>

                {/* Τύπος ερώτησης */}
                <div className="lec-field" style={{marginBottom:'8px'}}>
                  <select value={q.question_type}
                    onChange={e => updateQuestion(qi, 'question_type', e.target.value)}>
                    <option value="single_choice">Μία σωστή απάντηση</option>
                    <option value="multiple_choice">Πολλές σωστές απαντήσεις</option>
                    <option value="text">Ελεύθερο κείμενο (χειροκίνητη βαθμολόγηση)</option>
                  </select>
                </div>

                <div className="lec-field">
                  <input type="text" placeholder="Κείμενο ερώτησης..."
                    value={q.question_text}
                    onChange={e => updateQuestion(qi, 'question_text', e.target.value)} />
                </div>

                {/* Επιλογές — μόνο για single/multiple_choice */}
                {q.question_type !== 'text' && (
                  <>
                    <div className="lec-options-grid">
                      {q.options.map((opt, oi) => {
                        if (q.question_type === 'multiple_choice') {
                          const correctArr = (() => { try { return JSON.parse(q.correct_answer || '[]'); } catch { return []; } })();
                          const isChecked = correctArr.includes(opt) && opt !== '';
                          return (
                            <div key={oi} className="lec-option-row">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (!opt) return;
                                  const arr = correctArr.includes(opt)
                                    ? correctArr.filter(o => o !== opt)
                                    : [...correctArr, opt];
                                  updateQuestion(qi, 'correct_answer', JSON.stringify(arr));
                                }}
                              />
                              <input
                                type="text"
                                placeholder={`Επιλογή ${String.fromCharCode(65 + oi)}`}
                                value={opt}
                                onChange={e => {
                                  const old = opt;
                                  updateOption(qi, oi, e.target.value);
                                  if (correctArr.includes(old)) {
                                    const arr = correctArr.map(o => o === old ? e.target.value : o);
                                    updateQuestion(qi, 'correct_answer', JSON.stringify(arr));
                                  }
                                }}
                              />
                            </div>
                          );
                        }
                        // single_choice
                        return (
                          <div key={oi} className="lec-option-row">
                            <input
                              type="radio"
                              name={`correct_${qi}`}
                              checked={q.correct_answer === opt && opt !== ''}
                              onChange={() => opt && updateQuestion(qi, 'correct_answer', opt)}
                            />
                            <input
                              type="text"
                              placeholder={`Επιλογή ${String.fromCharCode(65 + oi)}`}
                              value={opt}
                              onChange={e => {
                                updateOption(qi, oi, e.target.value);
                                if (q.correct_answer === opt) updateQuestion(qi, 'correct_answer', e.target.value);
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <p className="lec-option-hint">
                      {q.question_type === 'multiple_choice' ? '☑ = σωστές απαντήσεις (μπορείς να επιλέξεις πολλές)' : '● = σωστή απάντηση'}
                    </p>
                  </>
                )}

                {q.question_type === 'text' && (
                  <p className="lec-option-hint" style={{color:'#f59e0b'}}>
                    ✏️ Ο φοιτητής θα γράψει ελεύθερο κείμενο. Βαθμολογείται χειροκίνητα από εσένα.
                  </p>
                )}
              </div>
            ))}

            <button className="lec-btn-ghost" onClick={addQuestion}>＋ Προσθήκη ερώτησης</button>

            {quizError && <p className="lec-error">{quizError}</p>}
            {quizSuccess && <p className="lec-success">✅ Quiz αποθηκεύτηκε!</p>}

            <div className="lec-edit-actions" style={{marginTop: '16px'}}>
              <button className="lec-btn-ghost" onClick={() => { setShowQuizPanel(false); setQuizError(null); }}>Ακύρωση</button>
              <button className="lec-btn-primary" onClick={handleSaveQuiz} disabled={savingQuiz}>
                {savingQuiz ? 'Αποθήκευση...' : '💾 Αποθήκευση Quiz'}
              </button>
            </div>
          </div>
        ) : (
          <div className="lec-empty-sections">
            <p>Δεν υπάρχει τελικό quiz ακόμα.</p>
          </div>
        )}
      </div>

      {/* Modal: Add Section */}
      {showAddSection && (
        <div className="lec-modal-overlay" onClick={() => setShowAddSection(false)}>
          <div className="lec-modal lec-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="lec-modal-header">
              <h2>Νέα Ενότητα</h2>
              <button className="lec-modal-close" onClick={() => setShowAddSection(false)}>✕</button>
            </div>
            <div className="lec-modal-body">
              <div className="lec-field">
                <label>Τίτλος ενότητας *</label>
                <input type="text" placeholder="π.χ. Εισαγωγή στην Python"
                  value={newSectionTitle}
                  onChange={e => setNewSectionTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddSection()} />
              </div>
              <label className="lec-checkbox-label">
                <input type="checkbox" checked={newSectionFree}
                  onChange={e => setNewSectionFree(e.target.checked)} />
                Δωρεάν πρόσβαση χωρίς εγγραφή
              </label>
            </div>
            <div className="lec-modal-footer">
              <button className="lec-btn-ghost" onClick={() => setShowAddSection(false)}>Ακύρωση</button>
              <button className="lec-btn-primary" onClick={handleAddSection} disabled={addingSec}>
                {addingSec ? 'Προσθήκη...' : 'Προσθήκη'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Lesson */}
      {showAddLesson && (
        <div className="lec-modal-overlay" onClick={() => setShowAddLesson(null)}>
          <div className="lec-modal lec-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="lec-modal-header">
              <h2>Νέο Lesson</h2>
              <button className="lec-modal-close" onClick={() => setShowAddLesson(null)}>✕</button>
            </div>
            <div className="lec-modal-body">
              <div className="lec-field">
                <label>Τίτλος *</label>
                <input type="text" placeholder="π.χ. Εισαγωγή στις μεταβλητές"
                  value={newLesson.title}
                  onChange={e => setNewLesson(l => ({ ...l, title: e.target.value }))} />
              </div>
              <div className="lec-field">
                <label>Τύπος</label>
                <select value={newLesson.lesson_type}
                  onChange={e => setNewLesson(l => ({ ...l, lesson_type: e.target.value }))}>
                  <option value="video">▶ Βίντεο</option>
                  <option value="pdf">📄 PDF</option>
                </select>
              </div>
              <label className="lec-checkbox-label">
                <input type="checkbox" checked={newLesson.is_free}
                  onChange={e => setNewLesson(l => ({ ...l, is_free: e.target.checked }))} />
                Δωρεάν πρόσβαση
              </label>
            </div>
            <div className="lec-modal-footer">
              <button className="lec-btn-ghost" onClick={() => setShowAddLesson(null)}>Ακύρωση</button>
              <button className="lec-btn-primary" onClick={handleAddLesson} disabled={addingLesson}>
                {addingLesson ? 'Προσθήκη...' : 'Προσθήκη'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function NotifSection({ courseId, headers }) {
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [notifs, setNotifs] = useState([]);

  useEffect(() => { loadNotifs(); }, []);

  const loadNotifs = async () => {
    const data = await fetch(`http://localhost:5000/api/courses/${courseId}/notifications`, {
      headers: headers()
    }).then(r => r.json()).catch(() => []);
    setNotifs(Array.isArray(data) ? data : []);
  };

  const send = async () => {
    if (!msg.trim()) return;
    setSending(true);
    try {
      await fetch(`http://localhost:5000/api/courses/${courseId}/notifications`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg.trim() })
      });
      setMsg('');
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      loadNotifs();
    } finally { setSending(false); }
  };

  const deleteNotif = async (id) => {
    await fetch(`http://localhost:5000/api/notifications/${id}`, {
      method: 'DELETE', headers: headers()
    });
    setNotifs(n => n.filter(x => x.id !== id));
  };

  return (
    <div className="lec-quiz-section">
      <div className="lec-sections-header">
        <div>
          <h2>Ειδοποιήσεις Εκπαιδευομένων</h2>
          <p className="lec-quiz-subtitle">Στείλε ειδοποιήσεις σε όλους τους εγγεγραμμένους</p>
        </div>
      </div>
      <div style={{display:'flex',gap:'8px',alignItems:'flex-end'}}>
        <textarea value={msg} onChange={e => setMsg(e.target.value)}
          placeholder="π.χ. Νέο υλικό ανέβηκε! Δείτε την ενότητα 3."
          rows={2}
          style={{flex:1,background:'#1e293b',border:'1px solid #334155',borderRadius:'8px',padding:'10px 12px',color:'#e2e8f0',fontSize:'14px',resize:'vertical'}}
        />
        <button className="lec-btn-primary" onClick={send} disabled={sending || !msg.trim()}>
          {sending ? 'Αποστολή...' : 'Κοινοποίηση Ειδοποίησης'}
        </button>
      </div>
      {sent && <p style={{color:'#34d399',fontSize:'13px',marginTop:'6px'}}>✅ Στάλθηκε!</p>}

      {notifs.length > 0 && (
        <div style={{marginTop:'16px',display:'flex',flexDirection:'column',gap:'8px'}}>
          {notifs.map(n => (
            <div key={n.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#1e293b',border:'1px solid #334155',borderRadius:'8px',padding:'10px 14px',gap:'12px'}}>
              <div style={{flex:1,minWidth:0}}>
                <p style={{color:'#e2e8f0',fontSize:'13px',margin:0,wordBreak:'break-word',whiteSpace:'pre-wrap'}}>{n.message}</p>
                <p style={{color:'#475569',fontSize:'11px',margin:'4px 0 0'}}>{new Date(n.created_at).toLocaleDateString('el-GR')}</p>
              </div>
              <button className="lec-btn-danger lec-btn-sm" onClick={() => deleteNotif(n.id)}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}