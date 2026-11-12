// @vitest-environment jsdom
/**
 * Reply cards and the final-answer bar: every response-seat reply carries the
 * card, the completed closing reply additionally carries the bar, and no
 * caption renders in any locale. The predicate that selects the final row is
 * covered by the ChatView specs, where a Turn and its tail are projected together.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import type { UseDisclosure, UseGroupAction, UsePresentation } from '../src/client/contract/slots.ts'
import type { AssistantBlock } from '../src/client/contract/snapshot.ts'
import { AssistantMarkdown, type AssistantMarkdownProps } from '../src/client/chat/AssistantMarkdown.tsx'
import { presentationPolicyFor } from '../src/client/presentation-policy.ts'
import { unusedImageLoader } from './reasoning-component-fixture.tsx'
import { de, en, es, fr, ja, pt, ru, zh } from '../src/client/locale.ts'

afterEach(cleanup)

const usePresentation: UsePresentation = selector => selector(presentationPolicyFor('standard'))

const useDisclosure: UseDisclosure = () => ({
  expanded: false,
  setExpanded: () => {},
  toggle: () => {},
})

const useGroupAction: UseGroupAction = () => ({ current: document.createElement('div') })

function mount(overrides: Partial<AssistantMarkdownProps> = {}, dictionary: typeof en | typeof zh = en) {
  const props: AssistantMarkdownProps = {
    blocks: [{ kind: 'text', text: 'The reply body.' }],
    streaming: false,
    loadImage: unusedImageLoader,
    useDisclosure,
    useGroupAction,
    usePresentation,
    renderSlot: () => null,
    t: makeTranslate(dictionary, commonEn),
    ...overrides,
  }
  const view = render(<AssistantMarkdown {...props} />)
  return { view, props }
}

function imageBlock(): AssistantBlock {
  return {
    kind: 'image',
    attachment: {
      attachmentId: AttachmentId('fixture-image'),
      mediaType: 'image/png',
      bytes: 1,
      width: 1,
      height: 1,
    },
  }
}

describe('reply cards and final-answer bar', () => {
  it('cards an intermediate reply without the final bar', () => {
    const { view } = mount()
    expect(view.container.querySelector('[data-reply-card]')).not.toBeNull()
    expect(view.container.querySelector('[data-final-answer]')).toBeNull()
    expect(view.getByText('The reply body.')).toBeDefined()
  })

  it('cards the completed closing answer and marks it with the bar', () => {
    const { view } = mount({ finalAnswer: true })
    const card = view.container.querySelector('[data-final-answer]') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.hasAttribute('data-reply-card')).toBe(true)
    expect(card.textContent).toBe('The reply body.')
  })

  it('cards a streaming reply without the bar', () => {
    const { view } = mount({ streaming: true })
    expect(view.container.querySelector('[data-reply-card]')).not.toBeNull()
    expect(view.container.querySelector('[data-final-answer]')).toBeNull()
  })

  it('cards an image-only reply without inventing a bar', () => {
    const { view } = mount({ blocks: [imageBlock()], groupPart: 'response' })
    expect(view.container.querySelector('[data-reply-card]')).not.toBeNull()
    expect(view.container.querySelector('[data-final-answer]')).toBeNull()
  })

  it('keeps the reasoning seat out of the card family', () => {
    const { view } = mount({
      blocks: [{ kind: 'reasoning', text: 'private reasoning' }],
      groupPart: 'reasoning',
      finalAnswer: true,
    })
    expect(view.container.querySelector('[data-reply-card]')).toBeNull()
    expect(view.container.querySelector('[data-final-answer]')).toBeNull()
  })

  it('renders no caption in any shipped locale', () => {
    for (const dictionary of [zh, en, ja, es, fr, de, ru, pt]) {
      const { view } = mount({ finalAnswer: true }, dictionary)
      expect(view.container.textContent).toBe('The reply body.')
      view.unmount()
    }
  })
})
