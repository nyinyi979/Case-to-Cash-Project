export default function BookStage({ symbolsMarkup }) {
  return (
    <>
      <div className="symbols" aria-hidden="true" dangerouslySetInnerHTML={{ __html: symbolsMarkup }} />
      <div className="stage" id="stage" aria-label="หน้าสมุด" />
    </>
  );
}
