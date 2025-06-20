function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getSafeFilename(timestamp: string, title: string): string {
  const dateStr = formatDateTime(timestamp).replace(/[: ]/g, '-');
  const safeTitle = title.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '-');
  
  const MAX_FILENAME_LENGTH = 160;
  const combinedName = `${dateStr}--${safeTitle}`;
  
  if (combinedName.length > MAX_FILENAME_LENGTH) {
    const truncatedTitle = safeTitle.substring(0, MAX_FILENAME_LENGTH - dateStr.length - 4);
    return `${dateStr}--${truncatedTitle}`;
  }
  
  return combinedName;
}

module.exports = {
  formatDateTime,
  getSafeFilename
};