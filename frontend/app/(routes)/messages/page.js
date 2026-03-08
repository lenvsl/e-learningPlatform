'use client';

import React, { useState, useEffect } from 'react';
import PrivateChat from '../../components/PrivateChat';
import './messages.css';

export default function MessagesPage() {
  const [users, setUsers] = useState([]);  // ✅ Default to empty array
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    
    const moveUserToTop = (userId) => {
  setUsers(prev => {
    const user = prev.find(u => u.id === userId);
    if (!user) return prev;

    return [user, ...prev.filter(u => u.id !== userId)];
  });
};

    if (!token) {
      window.location.href = '/login';
      return;
    }

    // Get current user from token
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setCurrentUser(payload);
      console.log('Current user:', payload);
    } catch (err) {
      console.error('Invalid token:', err);
      window.location.href = '/login';
      return;
    }

    // Get users to chat with
    fetch('http://localhost:5000/api/users/chat-list', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        console.log('Response status:', res.status);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        console.log('Chat users received:', data);
        
        // ✅ Safety check: Ensure data is an array
        if (Array.isArray(data)) {
          setUsers(data);
        } else {
          console.error('Expected array, got:', typeof data, data);
          setUsers([]);
          setError('Invalid data format');
        }
        
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading users:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return (
      <div className="error-page">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!currentUser) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="messages-page">
      {/* Sidebar with user list */}
      <div className="sidebar">
        <h2>Messages</h2>
        <div className="user-list">
          {users.length === 0 ? (
            <p className="no-users">No users available</p>
          ) : (
            users.map(user => (
              <div
                key={user.id}
                className={`user-item ${selectedUser?.id === user.id ? 'active' : ''}`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="user-avatar">
                  {user.first_name?.[0]}{user.last_name?.[0]}
                </div>
                <div className="user-info">
                  <div className="user-name">
                    {user.first_name} {user.last_name}
                  </div>
                  <div className="user-role">{user.role}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="chat-area">
        {selectedUser ? (
          <PrivateChat
            currentUserId={currentUser.id}
            otherUserId={selectedUser.id}
            otherUserName={`${selectedUser.first_name} ${selectedUser.last_name}`}
            otherUserEmail={selectedUser.email}
            onMessageSent={() => moveUserToTop(selectedUser.id)}
          />
        ) : (
          <div className="no-selection">
            <p>👈 Select a user to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}