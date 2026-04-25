'use client';

import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './PrivateChat.css';

const GroupChat = ({ currentUserId, chat, onRead }) => {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMembers, setShowMembers] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Φόρτωση μηνυμάτων + mark as read
  useEffect(() => {
    const token = sessionStorage.getItem('token');
    setLoading(true);
    fetch(`http://localhost:5000/api/group-chats/${chat.id}/messages`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        setMessages(Array.isArray(data) ? data : []);
        setLoading(false);
        // Mark as read
        fetch(`http://localhost:5000/api/group-chats/${chat.id}/read`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(() => onRead && onRead(chat.id));
      })
      .catch(() => setLoading(false));
  }, [chat.id]);

  // Φόρτωση μελών
  useEffect(() => {
    const token = sessionStorage.getItem('token');
    fetch(`http://localhost:5000/api/group-chats/${chat.id}/members`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => setMembers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [chat.id]);

  useEffect(() => {
    const newSocket = io('http://localhost:5000', { transports: ['websocket'] });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setConnected(true);
      newSocket.emit('join_group_room', { chatId: chat.id });
    });

    newSocket.on('disconnect', () => setConnected(false));

    newSocket.on('new_group_message', (msg) => {
      setMessages(prev => [...prev, msg]);
      // Mark as read αν είμαστε ήδη ανοικτοί
      const token = sessionStorage.getItem('token');
      fetch(`http://localhost:5000/api/group-chats/${chat.id}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(() => onRead && onRead(chat.id));
    });

    return () => newSocket.close();
  }, [chat.id]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim() || !socket || !connected) return;
    socket.emit('send_group_message', {
      chatId: chat.id,
      senderId: currentUserId,
      content: input.trim()
    });
    setInput('');
  };

  return (
    <div className="private-chat">
      <div className="chat-header">
        <div className="user-info">
          <h3>👥 {chat.title}</h3>
          <p className="user-email"
            style={{ cursor: 'pointer', color: '#a78bfa' }}
            onClick={() => setShowMembers(v => !v)}
          >
            {chat.member_count} μέλη {showMembers ? '▲' : '▼'}
          </p>
        </div>
      </div>

      {/* Members panel */}
      {showMembers && (
        <div className="group-members-panel">
          {members.map(m => (
            <div key={m.id} className="group-member-item">
              <span className="group-member-avatar">{m.first_name?.[0]}{m.last_name?.[0]}</span>
              <span className="group-member-name">{m.first_name} {m.last_name}</span>
              <span className="group-member-role">{m.role === 'lecturer' ? '👨‍🏫' : '🎓'}</span>
            </div>
          ))}
        </div>
      )}

      <div className="messages">
        {loading ? (
          <p className="loading-messages">Φόρτωση...</p>
        ) : messages.length === 0 ? (
          <p className="no-messages">Δεν υπάρχουν μηνύματα ακόμα.</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.sender_id === currentUserId ? 'sent' : 'received'}`}>
              {msg.sender_id !== currentUserId && (
                <div className="message-sender">{msg.first_name} {msg.last_name}</div>
              )}
              <div className="message-content">{msg.content}</div>
              <div className="message-time">
                {new Date(msg.sent_at).toLocaleString('el-GR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Γράψε μήνυμα..."
          disabled={!connected}
        />
        <button type="submit" disabled={!connected || !input.trim()}>Αποστολή</button>
      </form>
    </div>
  );
};

export default GroupChat;
