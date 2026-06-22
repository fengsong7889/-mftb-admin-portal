import { useState, useEffect } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { LinkNode } from '@lexical/link'
import { CodeNode, CodeHighlightNode } from '@lexical/code'
import { TableNode, TableRowNode, TableCellNode } from '@lexical/table'
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { TRANSFORMERS } from '@lexical/markdown'
import ToolbarPlugin from './ToolbarPlugin'
import './RichTextEditor.css'

interface RichTextEditorProps {
  initialContent?: string
  onChange?: (content: string) => void
  placeholder?: string
}

function onError(error: Error): void {
  console.error(error)
}

function theme() {
  return {
    paragraph: 'editor-paragraph',
    heading: {
      h1: 'editor-heading-h1',
      h2: 'editor-heading-h2',
      h3: 'editor-heading-h3',
    },
    list: {
      ul: 'editor-list-ul',
      ol: 'editor-list-ol',
      listitem: 'editor-listitem',
    },
    quote: 'editor-quote',
    code: 'editor-code',
    codeHighlight: {
      atrule: 'editor-tokenAttr',
      attr: 'editor-tokenAttr',
      boolean: 'editor-tokenProperty',
      builtin: 'editor-tokenSelector',
      cdata: 'editor-tokenComment',
      char: 'editor-tokenSelector',
      class: 'editor-tokenFunction',
      'class-name': 'editor-tokenFunction',
      comment: 'editor-tokenComment',
      constant: 'editor-tokenProperty',
      deleted: 'editor-tokenProperty',
      doctype: 'editor-tokenComment',
      entity: 'editor-tokenOperator',
      function: 'editor-tokenFunction',
      important: 'editor-tokenVariable',
      inserted: 'editor-tokenSelector',
      keyword: 'editor-tokenAttr',
      namespace: 'editor-tokenVariable',
      number: 'editor-tokenProperty',
      operator: 'editor-tokenOperator',
      prolog: 'editor-tokenComment',
      property: 'editor-tokenProperty',
      punctuation: 'editor-tokenPunctuation',
      regex: 'editor-tokenVariable',
      selector: 'editor-tokenSelector',
      string: 'editor-tokenSelector',
      symbol: 'editor-tokenProperty',
      tag: 'editor-tokenProperty',
      url: 'editor-tokenOperator',
      variable: 'editor-tokenVariable',
    },
    link: 'editor-link',
    table: 'editor-table',
    tableCell: 'editor-tableCell',
    tableHeader: 'editor-tableHeader',
    tableRow: 'editor-tableRow',
    tableScrollableWrapper: 'editor-tableScrollableWrapper',
  }
}

function InitialContentPlugin({ content }: { content: string }) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (content) {
      try {
        const parsedContent = JSON.parse(content)
        editor.setEditorState(editor.parseEditorState(parsedContent))
      } catch (e) {
        // 如果是纯文本，创建基本内容
        editor.update(() => {
          const root = $getRoot()
          root.clear()
          const paragraph = $createParagraphNode()
          paragraph.append($createTextNode(content))
          root.append(paragraph)
        })
      }
    }
  }, [editor, content])

  return null
}

function ChangePlugin({ onChange }: { onChange?: (content: string) => void }) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (onChange) {
      return editor.registerUpdateListener(({ editorState }) => {
        const jsonString = JSON.stringify(editorState)
        onChange(jsonString)
      })
    }
  }, [editor, onChange])

  return null
}

export default function RichTextEditor({ initialContent = '', onChange, placeholder = '开始编写...' }: RichTextEditorProps) {
  const initialConfig = {
    namespace: 'PRDEditor',
    theme: theme(),
    onError,
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      CodeNode,
      CodeHighlightNode,
      TableNode,
      TableRowNode,
      TableCellNode,
    ],
  }

  return (
    <div className="rich-text-editor">
      <LexicalComposer initialConfig={initialConfig}>
        <ToolbarPlugin />
        <div className="editor-container">
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            placeholder={<div className="editor-placeholder">{placeholder}</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <AutoFocusPlugin />
          <ListPlugin />
          <LinkPlugin />
          <TablePlugin />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <InitialContentPlugin content={initialContent} />
          <ChangePlugin onChange={onChange} />
        </div>
      </LexicalComposer>
    </div>
  )
}
