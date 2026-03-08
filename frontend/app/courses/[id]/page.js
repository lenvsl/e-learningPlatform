"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Chat from '../../components/Chat';

export default function CoursePage() {
  const params = useParams(); //Παίρνει το courseId από το URL
  const courseId = params.id;
  const [course, setCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [showChat, setShowChat] = useState(true);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    // Get token & user ID
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUserId(payload.id);

      // Fetch course data - Φέρνει τα δεδομένα του course από backend
      fetch(`http://localhost:5000/api/courses/${courseId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        setCourse(data);
        if (data.sections?.[0]?.lessons?.[0]) {
          setSelectedLesson(data.sections[0].lessons[0]);
        }
      })
      .catch(err => console.error(err));
    }
  }, [courseId]);

  if (!course) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading course...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar - Lessons */}
      <div className="w-80 bg-gray-800/60 backdrop-blur-sm border-r border-gray-700/50 overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-2">{course.title}</h2>
          <p className="text-sm text-gray-400 mb-6">{course.short_description}</p>

          {/* Chat Toggle */}
          <button
            onClick={() => setShowChat(!showChat)}
            className="w-full mb-6 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-lg transition-all"
          >
            {showChat ? '💬 Hide Chat' : '💬 Show Chat'}
          </button>

          {/* Sections & Lessons */}
          {course.sections?.map((section) => (
            <div key={section.id} className="mb-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.lessons?.map((lesson) => (
                  <li key={lesson.id}>
                    <button
                      onClick={() => setSelectedLesson(lesson)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                        selectedLesson?.id === lesson.id
                          ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg'
                          : 'bg-gray-700/30 text-gray-300 hover:bg-gray-700/50'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        {lesson.is_completed && (
                          <span className="text-green-400">✓</span>
                        )}
                        <span className="text-sm">{lesson.title}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content - Video/Lesson */}
      <div className={`flex-1 overflow-y-auto transition-all ${showChat ? 'mr-96' : ''}`}>
        <div className="p-8">
          {selectedLesson ? (
            <>
              <h1 className="text-3xl font-bold text-white mb-4">
                {selectedLesson.title}
              </h1>
              
              {selectedLesson.description && (
                <p className="text-gray-400 mb-6">{selectedLesson.description}</p>
              )}

              {/* Video Player */}
              {selectedLesson.lesson_type === 'video' && selectedLesson.video_url && (
                <div className="mb-6">
                  <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-2xl overflow-hidden shadow-xl">
                    <iframe
                      src={selectedLesson.video_url.replace('/view', '/preview')}
                      className="w-full aspect-video"
                      allow="autoplay"
                      allowFullScreen
                      title="Lesson Video"
                    />
                  </div>
                </div>
              )}

              {/* Complete Button */}
              <button className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg">
                ✓ Mark as Complete
              </button>
            </>
          ) : (
            <div className="text-center text-gray-400 mt-20">
              <p className="text-4xl mb-4">📚</p>
              <p>Select a lesson to start</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat Panel */}
      {showChat && userId && (
        <div className="fixed right-0 top-16 bottom-0 w-96 bg-gray-900 border-l border-gray-700/50">
          <Chat courseId={courseId} userId={userId} />
        </div>
      )}
    </div>
  );
}