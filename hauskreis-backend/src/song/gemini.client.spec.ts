import { sourcesOf } from './gemini.client';

describe('sourcesOf', () => {
  it('collects the url citations of the model output, once each', () => {
    const interaction = {
      steps: [
        { type: 'user_input', content: [{ type: 'text', text: 'Frage' }] },
        { type: 'google_search_call' },
        {
          type: 'model_output',
          content: [
            {
              type: 'text',
              text: '{"candidates":[]}',
              annotations: [
                {
                  type: 'url_citation',
                  url: 'https://a.example/1',
                  title: 'a',
                },
                { type: 'url_citation', url: 'https://b.example/2' },
                {
                  type: 'url_citation',
                  url: 'https://a.example/1',
                  title: 'a',
                },
                { type: 'file_citation', url: 'https://c.example/3' },
              ],
            },
          ],
        },
      ],
    };

    expect(sourcesOf(interaction)).toEqual([
      { url: 'https://a.example/1', title: 'a' },
      { url: 'https://b.example/2', title: null },
    ]);
  });

  it('finds nothing in an answer without steps', () => {
    expect(sourcesOf({})).toEqual([]);
    expect(sourcesOf({ steps: 'kaputt' })).toEqual([]);
  });
});
