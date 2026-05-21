export const DragOverlay = ({ isDragging }) =>
  isDragging ? (
    <div className="fixed inset-0 bg-indigo-600/90 z-50 flex items-center justify-center pointer-events-none">
      <div className="text-white text-4xl font-bold border-4 border-dashed border-white p-10 rounded-2xl animate-pulse">
        Drop File to Upload
      </div>
    </div>
  ) : null;
