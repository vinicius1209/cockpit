import { Component, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from './button'

interface Props {
  children: ReactNode
  fallbackLabel?: string
}

interface State {
  hasError: boolean
  error: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">Erro no {this.props.fallbackLabel || 'painel'}</p>
          <p className="text-xs text-muted-foreground max-w-xs">{this.state.error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Tentar novamente
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
