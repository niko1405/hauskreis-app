import { NotFoundException, PreconditionFailedException } from '@nestjs/common';
import {
  PreconditionRequiredException,
  updateWithVersionCheck,
} from './optimistic-update';
import type { IfMatchCondition } from './etag';

function setup(options: {
  count: number;
  exists?: unknown;
  condition?: IfMatchCondition;
  requireIfMatch?: boolean;
}) {
  const update = jest.fn().mockResolvedValue({ count: options.count });
  const exists = jest.fn().mockResolvedValue(options.exists ?? null);
  const reload = jest.fn().mockResolvedValue({ id: 'x', version: 1 });

  const run = () =>
    updateWithVersionCheck({
      condition: options.condition,
      requireIfMatch: options.requireIfMatch,
      update,
      exists,
      reload,
      notFoundMessage: 'Location x not found',
    });

  return { run, update, exists, reload };
}

describe('updateWithVersionCheck', () => {
  it('returns the reloaded entity when the update hit a row', async () => {
    const { run, reload } = setup({
      count: 1,
      condition: { kind: 'versions', versions: [0] },
    });

    await expect(run()).resolves.toEqual({ id: 'x', version: 1 });
    expect(reload).toHaveBeenCalled();
  });

  it('demands an If-Match header by default', async () => {
    const { run, update } = setup({ count: 1 });

    await expect(run()).rejects.toThrow(PreconditionRequiredException);
    expect(update).not.toHaveBeenCalled();
  });

  it('passes no version constraint when the requirement is waived', async () => {
    const { run, update } = setup({ count: 1, requireIfMatch: false });

    await run();

    expect(update).toHaveBeenCalledWith({});
  });

  it('constrains the update to the requested versions', async () => {
    const { run, update } = setup({
      count: 1,
      condition: { kind: 'versions', versions: [3] },
    });

    await run();

    expect(update).toHaveBeenCalledWith({ version: { in: [3] } });
  });

  it('treats the wildcard as "any version"', async () => {
    const { run, update } = setup({ count: 1, condition: { kind: 'any' } });

    await run();

    expect(update).toHaveBeenCalledWith({});
  });

  it('reports 412 when the row exists but the version moved on', async () => {
    const { run, reload } = setup({
      count: 0,
      exists: { id: 'x', version: 9 },
      condition: { kind: 'versions', versions: [3] },
    });

    await expect(run()).rejects.toThrow(PreconditionFailedException);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reports 404 when the row is gone entirely', async () => {
    const { run } = setup({
      count: 0,
      exists: null,
      condition: { kind: 'versions', versions: [3] },
    });

    await expect(run()).rejects.toThrow(NotFoundException);
  });

  it('reports 404 rather than 412 when the requirement was waived', async () => {
    // Nothing matched and the caller asked for no version, so the only
    // explanation is that the row does not exist.
    const { run } = setup({ count: 0, exists: null, requireIfMatch: false });

    await expect(run()).rejects.toThrow(NotFoundException);
  });

  it('rejects an If-Match that parsed to nothing usable', async () => {
    const { run } = setup({
      count: 0,
      exists: { id: 'x', version: 0 },
      condition: { kind: 'versions', versions: [] },
    });

    await expect(run()).rejects.toThrow(PreconditionFailedException);
  });
});
