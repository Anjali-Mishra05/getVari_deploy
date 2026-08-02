import React, { useState, useMemo } from 'react';
import FeedbackFilters from '../components/feedback/FeedbackFilters';
import FeedbackTable from '../components/feedback/FeedbackTable';
import FeedbackDetailModal from '../components/feedback/FeedbackDetailModal';
import { mockFeedback } from '../data/mockData';
import { Feedback } from '../types';

const FeedbackPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredAndSortedFeedback = useMemo(() => {
    let result = mockFeedback.filter(fb =>
      fb.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fb.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fb.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    result.sort((a, b) => {
      return sortOrder === 'newest' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp;
    });

    return result;
  }, [searchQuery, sortOrder]);

  const handleViewDetails = (feedback: Feedback) => {
    setSelectedFeedback(feedback);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <FeedbackFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortOrder={sortOrder}
        onSortToggle={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
      />

      <FeedbackTable
        feedbacks={filteredAndSortedFeedback}
        onViewDetails={handleViewDetails}
      />

      <FeedbackDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        feedback={selectedFeedback}
      />
    </div>
  );
};

export default FeedbackPage;
