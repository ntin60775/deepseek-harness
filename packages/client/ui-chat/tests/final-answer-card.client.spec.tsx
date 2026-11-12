// @vitest-environment jsdom
/**
 * Final-answer card presentation: the Assistant body carries the card material,
 * its caption resolves through the Chat dictionary, and the caption key exists
 * in every shipped dictionary. The predicate that selects the row is covered by
 * the ChatView specs, where a Turn and its tail are projected together.
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

describe('final-answer card', () => {
  it('wraps the reply with the localized caption when the row is the completed closing answer', () => {
    const { view } = mount({ finalAnswer: true })
    const card = view.container.querySelector('[data-final-answer]') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.textContent).toBe(`${en['message.finalAnswer']}The reply body.`)
    expect(view.getByText('The reply body.')).toBeDefined()
  })

  it('leaves an intermediate reply plain', () => {
    const { view } = mount()
    expect(view.container.querySelector('[data-final-answer]')).toBeNull()
    expect(view.queryByText(en['message.finalAnswer'])).toBeNull()
    expect(view.getByText('The reply body.')).toBeDefined()
  })

  it('keeps images inside an image-only reply without inventing a caption', () => {
    const { view } = mount({ blocks: [imageBlock()], groupPart: 'response' })
    expect(view.container.querySelector('[data-final-answer]')).toBeNull()
  })

  it('renders the caption in the active locale', () => {
    const { view } = mount({ finalAnswer: true }, ru)
    expect(view.getByText('Окончательный ответ')).toBeDefined()
  })

  it('declares the caption key in all eight dictionaries', () => {
    const labels = {
      zh: '最终回答',
      en: 'Final answer',
      ja: '最終回答',
      es: 'Respuesta final',
      fr: 'Réponse finale',
      de: 'Endgültige Antwort',
      ru: 'Окончательный ответ',
      pt: 'Resposta final',
    }
    const dictionaries = { zh, en, ja, es, fr, de, ru, pt }
    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      expect(dictionary['message.finalAnswer'], locale).toBe(labels[locale as keyof typeof labels])
      expect(makeTranslate(dictionary, commonEn)('message.finalAnswer'), locale).toBe(labels[locale as keyof typeof labels])
    }
  })
})
