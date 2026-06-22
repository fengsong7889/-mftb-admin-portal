import { useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list'
import { FORMAT_TEXT_COMMAND, $getSelection, $isRangeSelection } from 'lexical'
import { INSERT_TABLE_COMMAND } from '@lexical/table'
import {
  $createHeadingNode,
  $createQuoteNode,
  HeadingTagType,
} from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import './ToolbarPlugin.css'

export default function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext()

  const formatText = useCallback(
    (format: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code') => {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
    },
    [editor],
  )

  const insertList = useCallback(
    (type: 'bullet' | 'number') => {
      if (type === 'bullet') {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
      } else {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
      }
    },
    [editor],
  )

  const removeList = useCallback(() => {
    editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
  }, [editor])

  const insertTable = useCallback(() => {
    editor.dispatchCommand(INSERT_TABLE_COMMAND, { columns: '3', rows: '3' })
  }, [editor])

  const formatHeading = useCallback(
    (headingSize: HeadingTagType) => {
      if (headingSize) {
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createHeadingNode(headingSize))
          }
        })
      }
    },
    [editor],
  )

  const formatQuote = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createQuoteNode())
      }
    })
  }, [editor])

  return (
    <div className="toolbar">
      <button
        className="toolbar-btn"
        onClick={() => formatText('bold')}
        title="Bold (Ctrl+B)"
      >
        <i className="format bold" />
      </button>
      <button
        className="toolbar-btn"
        onClick={() => formatText('italic')}
        title="Italic (Ctrl+I)"
      >
        <i className="format italic" />
      </button>
      <button
        className="toolbar-btn"
        onClick={() => formatText('underline')}
        title="Underline (Ctrl+U)"
      >
        <i className="format underline" />
      </button>
      <button
        className="toolbar-btn"
        onClick={() => formatText('strikethrough')}
        title="Strikethrough"
      >
        <i className="format strikethrough" />
      </button>
      <button
        className="toolbar-btn"
        onClick={() => formatText('code')}
        title="Code"
      >
        <i className="format code" />
      </button>
      <div className="divider" />
      <button
        className="toolbar-btn"
        onClick={() => formatHeading('h1')}
        title="Heading 1"
      >
        H1
      </button>
      <button
        className="toolbar-btn"
        onClick={() => formatHeading('h2')}
        title="Heading 2"
      >
        H2
      </button>
      <button
        className="toolbar-btn"
        onClick={() => formatHeading('h3')}
        title="Heading 3"
      >
        H3
      </button>
      <button className="toolbar-btn" onClick={formatQuote} title="Quote">
        ❝
      </button>
      <div className="divider" />
      <button
        className="toolbar-btn"
        onClick={() => insertList('bullet')}
        title="Bullet List"
      >
        • 列表
      </button>
      <button
        className="toolbar-btn"
        onClick={() => insertList('number')}
        title="Numbered List"
      >
        1. 列表
      </button>
      <button className="toolbar-btn" onClick={removeList} title="Remove List">
        移除列表
      </button>
      <div className="divider" />
      <button className="toolbar-btn" onClick={insertTable} title="Insert Table">
        ▦ 表格
      </button>
    </div>
  )
}
