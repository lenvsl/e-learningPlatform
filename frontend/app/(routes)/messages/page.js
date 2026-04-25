'use client';

import React, { useState, useEffect, useRef } from 'react';
import PrivateChat from '../../components/PrivateChat';
import GroupChat from '../../components/GroupChat';
import io from 'socket.io-client';
import './messages.css';

const AVATAR_COLORS = [
  '#7c3aed', '#2563eb', '#059669', '#d97706',
  '#dc2626', '#db2777', '#0891b2', '#65a30d',
];

const avatarColor = (id) => AVATAR_COLORS[id % AVATAR_COLORS.length];

export default function MessagesPage() {
  const [users, setUsers] = useState([]);
  const [groupChats, setGroupChats] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('private');

  // Refs για να διαβάζει το socket πάντα την τρέχουσα τιμή
  const selectedUserRef = useRef(null);
  const selectedGroupRef = useRef(null);
  const currentUserRef = useRef(null);

  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);
  useEffect(() => { selectedGroupRef.current = selectedGroup; }, [selectedGroup]);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    if (!token) { window.location.href = '/login'; return; }

    let payload;
    try {
      payload = JSON.parse(decodeURIComponent(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')));
      setCurrentUser(payload);
      currentUserRef.current = payload;
    } catch {
      window.location.href = '/login';
      return;
    }

    const headers = { 'Authorization': `Bearer ${token}` };
    const socket = io('http://localhost:5000', { transports: ['websocket'] });

    Promise.all([
      fetch('http://localhost:5000/api/users/chat-list', { headers }).then(r => r.json()),
      fetch('http://localhost:5000/api/group-chats', { headers }).then(r => r.json()),
    ]).then(([usersData, groupsData]) => {
      const groups = Array.isArray(groupsData) ? groupsData : [];
      setUsers(Array.isArray(usersData) ? usersData : []);
      setGroupChats(groups);
      setLoading(false);
      // Join personal room + group rooms
      socket.emit('join_user_room', { userId: payload.id });
      groups.forEach(gc => socket.emit('join_group_room', { chatId: gc.id }));
    }).catch(() => setLoading(false));

    // Private: έρχεται notification στο personal room
    socket.on('new_message_notification', ({ sender_id }) => {
      if (Number(selectedUserRef.current?.id) !== Number(sender_id)) {
        fetch('http://localhost:5000/api/users/chat-list', { headers })
          .then(r => r.json())
          .then(data => { if (Array.isArray(data)) setUsers(data); });
      }
    });

    // Group: refetch όταν έρχεται νέο μήνυμα
    socket.on('new_group_message', (msg) => {
      const me = currentUserRef.current;
      if (!me || Number(msg.sender_id) === Number(me.id)) return;
      if (Number(selectedGroupRef.current?.id) !== Number(msg.chat_id)) {
        fetch('http://localhost:5000/api/group-chats', { headers })
          .then(r => r.json())
          .then(groups => { if (Array.isArray(groups)) setGroupChats(groups); });
      }
    });

    return () => socket.close();
  }, []);

  const handleGroupRead = (chatId) => {
    setGroupChats(prev => prev.map(gc => gc.id === chatId ? { ...gc, has_unread: false } : gc));
  };

  const handlePrivateRead = (userId) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, has_unread: false } : u));
  };

  const moveUserToTop = (userId) => {
    setUsers(prev => {
      const user = prev.find(u => u.id === userId);
      if (!user) return prev;
      return [user, ...prev.filter(u => u.id !== userId)];
    });
  };

  if (loading) return <div className="loading">Φόρτωση...</div>;
  if (!currentUser) return <div className="loading">Φόρτωση...</div>;

  return (
    <div className="messages-page">
      <div className="sidebar">
        <h2>Messages</h2>

        <div className="msg-tabs">
          <button className={`msg-tab ${tab === 'private' ? 'active' : ''}`} onClick={() => setTab('private')}>
            💬 Ιδιωτικά {users.some(u => u.has_unread) && <span className="msg-unread-dot" />}
          </button>
          <button className={`msg-tab ${tab === 'groups' ? 'active' : ''}`} onClick={() => setTab('groups')}>
            👥 Ομαδικά {groupChats.some(gc => gc.has_unread) && <span className="msg-unread-dot" />}
          </button>
        </div>

        <div className="user-list">
          {tab === 'private' ? (
            users.length === 0 ? (
              <p className="no-users">Δεν υπάρχουν χρήστες</p>
            ) : (
              users.map(user => (
                <div
                  key={user.id}
                  className={`user-item ${selectedUser?.id === user.id && !selectedGroup ? 'active' : ''}`}
                  onClick={() => { setSelectedUser(user); setSelectedGroup(null); }}
                >
                  <div className="user-avatar" style={{background: avatarColor(user.id)}}>{user.first_name?.[0]}{user.last_name?.[0]}</div>
                  <div className="user-info" style={{flex:1}}>
                    <div className="user-name">{user.first_name} {user.last_name}</div>
                    <div className="user-role">{user.role}</div>
                  </div>
                  {user.has_unread && <span className="msg-unread-dot" />}
                </div>
              ))
            )
          ) : (
            groupChats.length === 0 ? (
              <p className="no-users">Δεν συμμετέχεις σε ομαδικές συνομιλίες</p>
            ) : (
              groupChats.map(gc => (
                <div
                  key={gc.id}
                  className={`user-item ${selectedGroup?.id === gc.id ? 'active' : ''}`}
                  onClick={() => { setSelectedGroup(gc); setSelectedUser(null); }}
                >
                  <div className="user-avatar" style={{background:'#7c3aed'}}>👥</div>
                  <div className="user-info" style={{flex:1}}>
                    <div className="user-name">{gc.title}</div>
                    <div className="user-role">{gc.member_count} μέλη</div>
                  </div>
                  {gc.has_unread && <span className="msg-unread-dot" />}
                </div>
              ))
            )
          )}
        </div>
      </div>

      <div className="chat-area">
        {selectedGroup ? (
          <GroupChat currentUserId={currentUser.id} chat={selectedGroup} onRead={handleGroupRead} />
        ) : selectedUser ? (
          <PrivateChat
            currentUserId={currentUser.id}
            otherUserId={selectedUser.id}
            otherUserName={`${selectedUser.first_name} ${selectedUser.last_name}`}
            otherUserEmail={selectedUser.email}
            onMessageSent={() => moveUserToTop(selectedUser.id)}
            onRead={handlePrivateRead}
          />
        ) : (
          <div className="no-selection">
            <p>👈 Επίλεξε συνομιλία</p>
          </div>
        )}
      </div>
    </div>
  );
}
