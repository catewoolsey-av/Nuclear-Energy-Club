import React, { useState } from 'react';
import { BookOpen, Video, FileText, ExternalLink, Play, Eye, Calendar, Download } from 'lucide-react';
import { Card, Badge, Button, Modal } from '../../components/ui';
import { formatDate } from '../../utils/formatters';

const MemberContent = ({ content, sessions }) => {
  const categories = ['All', 'VC Fundamentals', 'Deal Analysis', 'Due Diligence', 'Portfolio Management', 'Term Sheets', 'Founder Relations', 'Market Analysis', 'Best Practices', 'Resources', 'Other'];
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedContent, setSelectedContent] = useState(null);
  
  const filteredContent = activeCategory === 'All' 
    ? content 
    : content.filter(c => c.category === activeCategory);
  
  const handleDownload = (item) => {
    if (item.file_url) {
      window.open(item.file_url, '_blank');
    } else if (item.url) {
      window.open(item.url, '_blank');
    } else {
      alert('Download not available for this item');
    }
  };

  const shouldShowFullContent = (item) => {
    const titleLen = item.title?.length || 0;
    const descLen = item.description?.length || 0;
    const categoryLen = item.category?.length || 0;
    const sessionLen = item.session_title?.length || 0;
    return titleLen > 60 || descLen > 140 || categoryLen > 22 || sessionLen > 40;
  };
  
  return (
    <div className="space-y-6">
      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === cat 
                ? 'text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={activeCategory === cat ? { backgroundColor: 'var(--primary-color, #1B4D5C)' } : {}}
          >
            {cat}
          </button>
        ))}
      </div>
      
      {/* Content Grid */}
      {filteredContent.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg mb-2">No content available</p>
          <p className="text-gray-400">Check back later for resources and materials</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContent.map((item) => {
            const showFullContent = shouldShowFullContent(item);
            return (
            <Card
              key={item.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedContent(item)}
            >
              <div className="flex flex-col h-full">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 mb-1 line-clamp-1">{item.title}</h4>
                  <p className="text-sm text-gray-600 mb-2 line-clamp-2 min-h-[2.5rem]">
                    {item.description || ''}
                  </p>
                  {item.session_title && (
                    <p className="text-xs text-gray-400 mt-1">From: {item.session_title}</p>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400 line-clamp-1">{item.category}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-gray-400 uppercase">{item.type || item.file_type}</span>
                    <Button variant="ghost" size="sm" icon={Download} onClick={(e) => { e.stopPropagation(); handleDownload(item); }}>
                      {(item.type === 'link' || item.file_type === 'link') ? 'Open' : 'Download'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )})}
        </div>
      )}

      <Modal
        isOpen={!!selectedContent}
        onClose={() => setSelectedContent(null)}
        title={selectedContent?.title || 'Content'}
        size="lg"
      >
        {selectedContent && (
          <div className="space-y-4 overflow-x-hidden break-words">
            {selectedContent.description && (
              <p className="text-gray-700 whitespace-pre-wrap break-words">{selectedContent.description}</p>
            )}
            <div className="text-sm text-gray-500 space-y-1">
              {selectedContent.category && <div className="break-words">Category: {selectedContent.category}</div>}
              {selectedContent.session_title && <div className="break-words">From: {selectedContent.session_title}</div>}
              {(selectedContent.type || selectedContent.file_type) && (
                <div className="break-words">Type: {selectedContent.type || selectedContent.file_type}</div>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="outline" icon={Download} onClick={() => handleDownload(selectedContent)}>
                {(selectedContent.type === 'link' || selectedContent.file_type === 'link') ? 'Open' : 'Download'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// Member Deals (Deal Room)

export default MemberContent;
