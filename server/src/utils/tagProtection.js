const protectTags = (text) => {
  const tags = [];

  const protectedText = text.replace(/<[^>]+>/g, (match) => {
    const token = `__TAG_${tags.length}__`;
    tags.push(match);
    return token;
  });

  return {
    protectedText,
    tags
  };
};

module.exports = {
  protectTags
};
