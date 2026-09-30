import { describe, expect, it, vi } from 'vitest';
import { legacyMilanCorrections } from '../src/place-corrections';
import { LLMUnavailable, type LLM, type LLMResponse } from '../src/llm/types';

function model(answer: Partial<LLMResponse> = {}) {
  const complete = vi.fn<LLM['complete']>().mockResolvedValue({
    text: '', json: { names: ['Bocconi University', 'Università Bocconi'] }, usedWeb: false, model: 'fake', ...answer,
  });
  return { id: 'fake', local: true, canSearch: false, complete } satisfies LLM;
}

describe('legacy Milan name correction (F0-7)', () => {
  it('recovers the hackathon guesses through the injected model, with one bounded request', async () => {
    const llm = model();
    const signal = new AbortController().signal;
    expect(await legacyMilanCorrections('  Baconi   University  ', llm, signal)).toEqual(['Bocconi University', 'Università Bocconi']);
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(llm.complete.mock.calls[0][0]).toMatchObject({ maxTokens: 256, timeoutMs: 10_000, webSearch: false, signal,
      messages: [{ role: 'user', content: expect.stringContaining('"Baconi University"') }],
      schema: { properties: { names: { type: 'array', items: { type: 'string' } } } },
    });
  });

  it('skips the model when unavailable, the query is empty, or the caller already cancelled', async () => {
    const llm = model();
    expect(await legacyMilanCorrections('Baconi University')).toEqual([]);
    expect(await legacyMilanCorrections('Baconi University', null)).toEqual([]);
    expect(await legacyMilanCorrections(' \n ', llm)).toEqual([]);
    expect(await legacyMilanCorrections('Baconi University', llm, AbortSignal.abort())).toEqual([]);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('normalises whitespace and bounds both the query and the two nonempty suggestions', async () => {
    const llm = model({ json: { names: ['  ', ' Bocconi\n University ', 'x'.repeat(250), 'third'] } });
    expect(await legacyMilanCorrections('q'.repeat(300), llm)).toEqual(['Bocconi University', 'x'.repeat(200)]);
    expect(llm.complete.mock.calls[0][0].messages[0].content).toContain(JSON.stringify('q'.repeat(200)));
    expect(llm.complete.mock.calls[0][0].messages[0].content).not.toContain('q'.repeat(201));
  });

  it('accepts JSON text from an adapter that does not populate json', async () => {
    expect(await legacyMilanCorrections('Baconi University', model({ json: undefined,
      text: '{"names":["Bocconi University"]}' }))).toEqual(['Bocconi University']);
  });

  it.each([null, [], 'Bocconi', {}, { names: 'Bocconi' }, { names: [42] }, { names: [null] }, { names: [{}] },
    { names: ['Bocconi', 42] }])('rejects malformed output instead of turning it into a place name: %j', async (json) => {
    expect(await legacyMilanCorrections('Baconi University', model({ json }))).toEqual([]);
  });

  it('returns no guesses for malformed JSON, model refusal or a timeout', async () => {
    expect(await legacyMilanCorrections('Baconi University', model({ json: undefined, text: 'not JSON' }))).toEqual([]);
    for (const failure of [new LLMUnavailable('The model declined.'), new DOMException('Timed out', 'TimeoutError')]) {
      const llm = model();
      llm.complete.mockRejectedValue(failure);
      expect(await legacyMilanCorrections('Baconi University', llm)).toEqual([]);
      expect(llm.complete).toHaveBeenCalledTimes(1);
    }
  });

  it('discards a response if cancellation happened while the model was answering', async () => {
    const controller = new AbortController();
    const llm = model();
    llm.complete.mockImplementation(async () => {
      controller.abort();
      return { text: '', json: { names: ['Bocconi University'] }, usedWeb: false, model: 'fake' };
    });
    expect(await legacyMilanCorrections('Baconi University', llm, controller.signal)).toEqual([]);
  });
});
