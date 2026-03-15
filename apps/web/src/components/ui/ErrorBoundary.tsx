import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorMessage } from './ErrorMessage'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="p-6">
          <ErrorMessage
            title="Algo deu errado"
            message="Ocorreu um erro inesperado. Tente recarregar a pagina."
            onRetry={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
          />
        </div>
      )
    }

    return this.props.children
  }
}
